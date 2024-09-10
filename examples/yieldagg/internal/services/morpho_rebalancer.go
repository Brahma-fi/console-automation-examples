package services

import (
	"context"
	"math/big"
	"math/rand"
	"strings"
	"time"

	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	utils "github.com/Brahma-fi/console-automation-examples/utils/abis/erc20"
	"github.com/Brahma-fi/console-automation-examples/utils/logger"
	"github.com/Brahma-fi/console-automation-examples/utils/pretty"
	"github.com/Brahma-fi/console-automation-examples/utils/scheduler"
	"github.com/Brahma-fi/go-safe/encoders"
	"github.com/Brahma-fi/go-safe/types"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"go.uber.org/zap"
)

var (
	availableVaults = []string{
		"0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61",
		"0xdB90A4e973B7663ce0Ccc32B6FbD37ffb19BfA83",
		"0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
		"0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12",
		"0x12AFDeFb2237a5963e7BAb3e2D46ad0eee70406e",
		"0x0FaBfEAcedf47e890c50C8120177fff69C6a1d9B",
	}
	// strategyBaseToken: USDC
	strategyToken = common.HexToAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
)

type MorphoBalancingStrategy struct {
	client                morphoClient
	strategyBaseToken     common.Address
	baseTokenCaller       *utils.Erc20Caller
	executor              consoleExecutor
	exit                  bool
	initTime              int64
	enableRandomSwitching bool
}

func NewMorphoBalancingStrategy(
	client morphoClient,
	executor consoleExecutor,
	caller bind.ContractCaller,
	exit bool,
	enableRandomSwitching bool,
) (*MorphoBalancingStrategy, error) {

	tokenClient, err := utils.NewErc20Caller(strategyToken, caller)
	if err != nil {
		return nil, err
	}

	return &MorphoBalancingStrategy{
		client:                client,
		exit:                  exit,
		strategyBaseToken:     strategyToken,
		baseTokenCaller:       tokenClient,
		executor:              executor,
		enableRandomSwitching: enableRandomSwitching,
	}, nil
}

func (m *MorphoBalancingStrategy) Run(ctx context.Context) error {
	if m.initTime == 0 {
		m.initTime, _ = ctx.Value(scheduler.ExecutionTimeCtxKey{}).(int64)
	}

	log := logger.NewLogger("strategy")
	subscription, err := m.executor.Subscriptions(ctx)
	if err != nil {
		return err
	}

	if len(subscription) == 0 {
		return nil
	}
	vaults, err := m.client.Vaults(ctx, m.strategyBaseToken)
	if err != nil {
		return err
	}

	log.Info("subscription", zap.Any("0", subscription[0]))

	subaccount := common.HexToAddress(subscription[0].SubAccountAddress)
	currentVault, err := m.ActiveVault(ctx, log, subaccount)
	if err != nil {
		return err
	}

	subAccBalance, err := m.baseTokenCaller.BalanceOf(&bind.CallOpts{Context: ctx}, subaccount)
	if err != nil {
		return err
	}

	hasAvailableBalance := subAccBalance.Cmp(big.NewInt(0)) > 0
	isAlreadyInVault := currentVault != common.HexToAddress("")

	if m.exit && isAlreadyInVault {
		return m.Redeem(ctx, log, subaccount, currentVault)
	}

	bestVault, _ := m.findBestVault(vaults)
	// randomly switch between pools
	// not to be actually enabled
	if m.enableRandomSwitching && time.Now().Unix()-m.initTime > 180 {
		bestVault, _ = m.findRandomVault(vaults)
		m.initTime = time.Now().Unix() + 360
	}

	if bestVault == currentVault {
		log.Info("no re-balance signal")
		return nil
	}

	if !isAlreadyInVault && hasAvailableBalance {
		log.Info("entering strategy", zap.String("address", bestVault.String()))
		return m.Deposit(ctx, log, subaccount, bestVault)
	}

	if isAlreadyInVault && bestVault != currentVault {
		log.Info("re-balance strategy", zap.String("from", currentVault.String()), zap.String("to", bestVault.String()))
		return m.RedeemAndDeposit(ctx, log, subaccount, currentVault, bestVault)
	}

	return nil
}

func (m *MorphoBalancingStrategy) findBestVault(
	vaults []entity.VaultInfo,
) (common.Address, float64) {
	var bestVault common.Address
	var bestApy float64

	for _, vault := range vaults {
		if vault.State.NetApy > bestApy {
			bestApy = vault.State.NetApy
			bestVault = common.HexToAddress(vault.Address)
		}
	}

	return bestVault, bestApy
}

func (m *MorphoBalancingStrategy) findRandomVault(vaults []entity.VaultInfo) (common.Address, float64) {
	randVault := rand.Int() % len(vaults)
	return common.HexToAddress(vaults[randVault].Address), vaults[randVault].State.NetApy
}

func (m *MorphoBalancingStrategy) Deposit(
	ctx context.Context,
	log *zap.Logger,
	user common.Address,
	vault common.Address,
) error {
	balance, err := m.baseTokenCaller.BalanceOf(&bind.CallOpts{Context: ctx}, user)
	if err != nil {
		return err
	}

	erc20ABI, err := abi.JSON(strings.NewReader(utils.Erc20MetaData.ABI))
	if err != nil {
		return err
	}

	approveCallData, err := erc20ABI.Pack("approve", vault, balance)
	if err != nil {
		return err
	}

	approveTxn := &entity.Transaction{
		Target: m.strategyBaseToken,
		Val:    new(big.Int).SetInt64(0),
		Data:   common.Bytes2Hex(approveCallData),
	}

	depositCallData, err := m.client.Deposit(user, balance)
	if err != nil {
		return err
	}

	depositTxn := &entity.Transaction{
		Target: vault,
		Val:    new(big.Int).SetInt64(0),
		Data:   common.Bytes2Hex(depositCallData),
	}

	safeTx, err := encoders.GetEncodedSafeTx(common.HexToAddress(""), common.HexToAddress(config.SafeMultiSendCallOnly), &config.SafeMultiSendABI, []types.Transaction{
		approveTxn,
		depositTxn,
	}, config.BaseChainID)
	if err != nil {
		return err
	}

	taskID, err := m.executor.Execute(ctx, &entity.SignAndExecuteRequest{
		Subaccount: user.Hex(),
		ChainID:    config.BaseChainID,
		Operation:  safeTx.Operation,
		To:         safeTx.To.String(),
		Value:      safeTx.Value.String(),
		Data:       safeTx.Data.String(),
	})

	log.Info("executed strategy signal", zap.String("taskID", taskID))
	return err
}

func (m *MorphoBalancingStrategy) Redeem(
	ctx context.Context,
	log *zap.Logger,
	user common.Address,
	vault common.Address,
) error {
	depositCallData, err := m.client.RedeemMax(ctx, vault, user)
	if err != nil {
		return err
	}

	depositTxn := &entity.Transaction{
		Target: vault,
		Val:    new(big.Int).SetInt64(0),
		Data:   common.Bytes2Hex(depositCallData),
	}

	safeTx, err := encoders.GetEncodedSafeTx(common.HexToAddress(""), common.HexToAddress(config.SafeMultiSendCallOnly), &config.SafeMultiSendABI, []types.Transaction{
		depositTxn,
	}, config.BaseChainID)
	if err != nil {
		return err
	}

	taskID, err := m.executor.Execute(ctx, &entity.SignAndExecuteRequest{
		Subaccount: user.Hex(),
		ChainID:    config.BaseChainID,
		Operation:  safeTx.Operation,
		To:         safeTx.To.String(),
		Value:      safeTx.Value.String(),
		Data:       safeTx.Data.String(),
	})

	log.Info("executed exit strategy signal", zap.String("taskID", taskID))
	panic("exited")
	return err
}

func (m *MorphoBalancingStrategy) RedeemAndDeposit(
	ctx context.Context,
	log *zap.Logger,
	user common.Address,
	from common.Address,
	to common.Address,
) error {
	balance, err := m.client.PreviewRedeem(ctx, from, user)
	if err != nil {
		return err
	}

	redeemCallData, err := m.client.RedeemMax(ctx, from, user)
	if err != nil {
		return err
	}

	redeemTxn := &entity.Transaction{
		Target: from,
		Val:    new(big.Int).SetInt64(0),
		Data:   common.Bytes2Hex(redeemCallData),
	}

	erc20ABI, err := abi.JSON(strings.NewReader(utils.Erc20MetaData.ABI))
	if err != nil {
		return err
	}

	approveCallData, err := erc20ABI.Pack("approve", to, balance)
	if err != nil {
		return err
	}

	approveTxn := &entity.Transaction{
		Target: m.strategyBaseToken,
		Val:    new(big.Int).SetInt64(0),
		Data:   common.Bytes2Hex(approveCallData),
	}

	depositCallData, err := m.client.Deposit(user, balance)
	if err != nil {
		return err
	}

	depositTxn := &entity.Transaction{
		Target: to,
		Val:    new(big.Int).SetInt64(0),
		Data:   common.Bytes2Hex(depositCallData),
	}

	safeTx, err := encoders.GetEncodedSafeTx(common.HexToAddress(""), common.HexToAddress(config.SafeMultiSendCallOnly), &config.SafeMultiSendABI, []types.Transaction{
		redeemTxn,
		approveTxn,
		depositTxn,
	}, config.BaseChainID)
	if err != nil {
		return err
	}

	taskID, err := m.executor.Execute(ctx, &entity.SignAndExecuteRequest{
		Subaccount: user.Hex(),
		ChainID:    config.BaseChainID,
		Operation:  safeTx.Operation,
		To:         safeTx.To.String(),
		Value:      safeTx.Value.String(),
		Data:       safeTx.Data.String(),
	})

	log.Info("executed strategy signal", zap.String("taskID", taskID))
	return err
}

func (m *MorphoBalancingStrategy) ActiveVault(
	ctx context.Context,
	log *zap.Logger,
	user common.Address,
) (common.Address, error) {
	for _, vault := range availableVaults {
		shares, err := m.client.Shares(ctx, common.HexToAddress(vault), user)
		if err != nil {
			return common.Address{}, err
		}

		if shares.Int64() != 0 {
			log.Info("active strategy", zap.String("address", vault), zap.String("shares", shares.String()))
			return common.HexToAddress(vault), nil
		}
	}

	return common.Address{}, nil
}

func (m *MorphoBalancingStrategy) Strategies(ctx context.Context) error {
	vaults, err := m.client.Vaults(ctx, m.strategyBaseToken)
	if err != nil {
		return err
	}

	pretty.RenderVaults(vaults)
	return nil
}
