package services

import (
	"context"
	"math/big"

	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	utils "github.com/Brahma-fi/console-automation-examples/utils/abis/executorplugin"
	"github.com/Brahma-fi/console-automation-examples/utils/executor"
	"github.com/Brahma-fi/console-automation-examples/utils/logger"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.uber.org/zap"
)

const (
	// _executorPluginAddress https://basescan.org/address/0xb92929d03768a4F8D69552e15a8071EAf8E684ed
	_executorPluginAddress = "0xb92929d03768a4F8D69552e15a8071EAf8E684ed"
)

type ConsoleExecutor struct {
	chainID        uint64
	executor       keyManager
	client         consoleClient
	metadata       *entity.ExecutorMetadata
	executorPlugin *utils.ExecutorpluginCaller
}

func NewConsoleExecutor(
	ctx context.Context,
	chainID uint64,
	rpcURL string,
	executor keyManager,
	client consoleClient,
) (*ConsoleExecutor, error) {
	metadata, err := client.ExecutorByAddress(ctx, executor.Address(), chainID)
	if err != nil {
		return nil, err
	}

	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, err
	}

	executorPlugin, err := utils.NewExecutorpluginCaller(common.HexToAddress(_executorPluginAddress), ethClient)
	if err != nil {
		return nil, err
	}

	return &ConsoleExecutor{
		chainID:        chainID,
		metadata:       metadata,
		client:         client,
		executor:       executor,
		executorPlugin: executorPlugin,
	}, nil
}

func (e *ConsoleExecutor) Execute(ctx context.Context, req *entity.SignAndExecuteRequest) (string, error) {
	log := logger.NewLogger("console-executor")
	val, _ := new(big.Int).SetString(req.Value, 10)
	callData, err := hexutil.Decode(req.Data)
	if err != nil {
		return "", err
	}

	nonce, err := e.executorPlugin.ExecutorNonce(&bind.CallOpts{
		Context: ctx,
	}, common.HexToAddress(req.Subaccount), e.executor.Address())
	if err != nil {
		return "", err
	}

	executableDigest, err := executor.GenerateExecutableDigest(executor.GenerateExecutableTypedDataParams{
		ChainID:       req.ChainID,
		PluginAddress: common.HexToAddress(_executorPluginAddress),
		To:            common.HexToAddress(req.To),
		Value:         val,
		Data:          callData,
		Operation:     req.Operation,
		Account:       common.HexToAddress(req.Subaccount),
		Nonce:         nonce,
		Executor:      e.executor.Address(),
	})
	if err != nil {
		return "", err
	}

	log.Info("signing digest", zap.String("digest", executableDigest.Hex()))
	sig, err := e.executor.Sign(ctx, executableDigest.Hex(), e.executor.Address())
	if err != nil {
		return "", err
	}

	log.Info("executor signature", zap.String("sig", hexutil.Encode(sig)))

	resp, err := e.client.Execute(ctx, &entity.ExecuteTaskReq{
		ChainID: int64(req.ChainID),
		Task: entity.Task{
			Subaccount:        req.Subaccount,
			Executor:          e.executor.Address().Hex(),
			ExecutorSignature: hexutil.Encode(sig),
			Executable: entity.Executable{
				CallType: req.Operation,
				To:       req.To,
				Value:    req.Value,
				Data:     req.Data,
			},
		},
		Webhook: "",
	})
	if err != nil {
		return "", err
	}

	return resp.Data.TaskId, nil
}

func (e *ConsoleExecutor) Subscriptions(ctx context.Context) ([]entity.ClientSubscription, error) {
	return e.client.ActiveSubscriptions(ctx, e.metadata.Id)
}
