package app

import (
	"context"

	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/Brahma-fi/console-automation-examples/internal/services"
	"github.com/ethereum/go-ethereum/ethclient"
)

type serviceStorage struct {
	ConsoleExecutor *services.ConsoleExecutor
	Strategy        *services.MorphoBalancingStrategy
}

func newServiceStorage(ctx context.Context, c *config.Config, is *integrationStorage) (*serviceStorage, error) {
	client, err := ethclient.Dial(c.BaseRpcURL)
	if err != nil {
		return nil, err
	}

	ss := &serviceStorage{}
	ss.ConsoleExecutor, err = services.NewConsoleExecutor(ctx, config.BaseChainID, c.BaseRpcURL, is.KeyManager, is.ConsoleClient)
	if err != nil {
		return nil, err
	}

	// set exit to true if all users positions should be closed
	ss.Strategy, err = services.NewMorphoBalancingStrategy(is.MorphoClient, ss.ConsoleExecutor, client, false, true)
	if err != nil {
		return nil, err
	}

	return ss, nil
}
