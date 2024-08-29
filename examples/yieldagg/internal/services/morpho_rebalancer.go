package services

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	utils "github.com/Brahma-fi/console-automation-examples/utils/abis/erc20"
	"github.com/Brahma-fi/go-safe/encoders"
	"github.com/Brahma-fi/go-safe/types"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
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
	client            morphoClient
	strategyBaseToken common.Address
	baseTokenCaller   *utils.Erc20Caller
	executor          consoleExecutor
}

func NewMorphoBalancingStrategy(
	client morphoClient,
	executor consoleExecutor,
	caller bind.ContractCaller,
) (*MorphoBalancingStrategy, error) {

	tokenClient, err := utils.NewErc20Caller(strategyToken, caller)
	if err != nil {
		return nil, err
	}

	return &MorphoBalancingStrategy{
		client: client,

		strategyBaseToken: strategyToken,
		baseTokenCaller:   tokenClient,
		executor:          executor,
	}, nil
}

func (m *MorphoBalancingStrategy) Run(ctx context.Context, subaccount common.Address, exit bool) error {
	vaults, err := m.client.Vaults(ctx, m.strategyBaseToken)
	if err != nil {
		return err
	}

	currentVault, err := m.ActiveVault(ctx, subaccount)
	if err != nil {
		return err
	}

	subAccBalance, err := m.baseTokenCaller.BalanceOf(&bind.CallOpts{Context: ctx}, subaccount)
	if err != nil {
		return err
	}

	hasAvailableBalance := subAccBalance.Cmp(big.NewInt(0)) > 0
	isAlreadyInVault := currentVault != common.HexToAddress("")

	if exit && isAlreadyInVault {
		return m.Redeem(ctx, subaccount, currentVault)
	}

	bestVault, _ := m.findBestVault(vaults)
	if bestVault == currentVault {
		return nil
	}

	if !isAlreadyInVault && hasAvailableBalance {
		return m.Deposit(ctx, subaccount, bestVault)
	}

	if isAlreadyInVault && bestVault != currentVault {
		return m.RedeemAndDeposit(ctx, subaccount, currentVault, bestVault)
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

func (m *MorphoBalancingStrategy) Deposit(ctx context.Context, user common.Address, vault common.Address) error {
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

	fmt.Println(taskID)
	return err
}

func (m *MorphoBalancingStrategy) Redeem(
	ctx context.Context,
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

	_, err = m.executor.Execute(ctx, &entity.SignAndExecuteRequest{
		Subaccount: user.Hex(),
		ChainID:    config.BaseChainID,
		Operation:  safeTx.Operation,
		To:         safeTx.To.String(),
		Value:      safeTx.Value.String(),
		Data:       safeTx.Data.String(),
	})

	return err
}

func (m *MorphoBalancingStrategy) RedeemAndDeposit(
	ctx context.Context,
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

	_, err = m.executor.Execute(ctx, &entity.SignAndExecuteRequest{
		Subaccount: user.Hex(),
		ChainID:    config.BaseChainID,
		Operation:  safeTx.Operation,
		To:         safeTx.To.String(),
		Value:      safeTx.Value.String(),
		Data:       safeTx.Data.String(),
	})

	return err
}

func (m *MorphoBalancingStrategy) ActiveVault(ctx context.Context, user common.Address) (common.Address, error) {
	for _, vault := range availableVaults {
		shares, err := m.client.Shares(ctx, common.HexToAddress(vault), user)
		if err != nil {
			return common.Address{}, err
		}

		if shares.Int64() != 0 {
			return common.HexToAddress(vault), nil
		}
	}

	return common.Address{}, nil
}
