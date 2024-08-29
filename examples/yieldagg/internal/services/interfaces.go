package services

import (
	"context"
	"math/big"

	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	"github.com/ethereum/go-ethereum/common"
)

type keyManager interface {
	Sign(_ context.Context, hash string, _ common.Address) ([]byte, error)
	Address() common.Address
}

type consoleClient interface {
	ExecutorByAddress(
		ctx context.Context,
		address common.Address,
		chainID uint64,
	) (*entity.ExecutorMetadata, error)
	ActiveSubscriptions(
		ctx context.Context,
		registryID string,
	) ([]entity.ClientSubscription, error)
	Execute(ctx context.Context, req *entity.ExecuteTaskReq) (*entity.ExecuteTaskResp, error)
}

type morphoClient interface {
	Vaults(
		ctx context.Context,
		assetAddress common.Address,
	) ([]entity.VaultInfo, error)
	User(ctx context.Context, address common.Address) ([]entity.UserInfo, error)
	Deposit(
		depositor common.Address,
		amt *big.Int,
	) ([]byte, error)
	RedeemMax(
		ctx context.Context,
		vaultAddr common.Address,
		depositor common.Address,
	) ([]byte, error)
	PreviewRedeem(
		ctx context.Context,
		vaultAddr common.Address,
		depositor common.Address,
	) (*big.Int, error)
	Shares(
		ctx context.Context,
		vaultAddr common.Address,
		depositor common.Address,
	) (*big.Int, error)
}

type consoleExecutor interface {
	Execute(ctx context.Context, req *entity.SignAndExecuteRequest) (string, error)
}
