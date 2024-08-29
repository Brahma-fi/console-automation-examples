package integrations

import (
	"context"
	"math/big"
	"strings"

	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	utils "github.com/Brahma-fi/console-automation-examples/utils/abis/metamorpho"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/shurcooL/graphql"
)

const (
	_chainIDBase = 8453
)

type MorphoClient struct {
	client *graphql.Client
	caller bind.ContractCaller
}

func NewMorphoClient(baseURL string, caller bind.ContractCaller) *MorphoClient {
	return &MorphoClient{client: graphql.NewClient(baseURL, nil), caller: caller}
}

func (c *MorphoClient) Vaults(
	ctx context.Context,
	assetAddress common.Address,
) ([]entity.VaultInfo, error) {
	var query entity.VaultQuery
	variables := map[string]interface{}{
		"asset":   []graphql.String{graphql.String(assetAddress.Hex())},
		"chainID": []graphql.Int{graphql.Int(_chainIDBase)},
	}

	err := c.client.Query(ctx, &query, variables)
	if err != nil {
		return nil, err
	}

	return query.ToVaultInfo(), nil
}

func (c *MorphoClient) User(ctx context.Context, address common.Address) ([]entity.UserInfo, error) {
	var query entity.UserQuery
	variables := map[string]interface{}{
		"address": []graphql.String{graphql.String(address.Hex())},
	}

	err := c.client.Query(ctx, &query, variables)
	if err != nil {
		return nil, err
	}

	if len(query.Users.Items) == 0 {
		return make([]entity.UserInfo, 0), nil
	}

	return query.ToUserInfo(), nil
}

func (c *MorphoClient) Shares(
	ctx context.Context,
	vaultAddr common.Address,
	depositor common.Address,
) (*big.Int, error) {
	vault, err := utils.NewMorphoCaller(vaultAddr, c.caller)
	if err != nil {
		return nil, err
	}

	return vault.BalanceOf(&bind.CallOpts{Context: ctx}, depositor)
}

func (c *MorphoClient) PreviewRedeem(
	ctx context.Context,
	vaultAddr common.Address,
	depositor common.Address,
) (*big.Int, error) {
	shares, err := c.Shares(ctx, vaultAddr, depositor)
	if err != nil {
		return nil, err
	}

	vault, err := utils.NewMorphoCaller(vaultAddr, c.caller)
	if err != nil {
		return nil, err
	}

	return vault.PreviewRedeem(&bind.CallOpts{Context: ctx}, shares)
}

func (c *MorphoClient) RedeemMax(
	ctx context.Context,
	vaultAddr common.Address,
	depositor common.Address,
) ([]byte, error) {
	shares, err := c.Shares(ctx, vaultAddr, depositor)
	if err != nil {
		return nil, err
	}

	vaultAbi, err := abi.JSON(strings.NewReader(utils.MorphoMetaData.ABI))
	if err != nil {
		return nil, err
	}

	return vaultAbi.Pack("redeem", shares, depositor, depositor)
}

func (c *MorphoClient) Deposit(
	depositor common.Address,
	amt *big.Int,
) ([]byte, error) {
	vaultAbi, err := abi.JSON(strings.NewReader(utils.MorphoMetaData.ABI))
	if err != nil {
		return nil, err
	}

	return vaultAbi.Pack("deposit", amt, depositor)
}
