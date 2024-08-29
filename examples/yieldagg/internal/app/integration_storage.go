package app

import (
	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/Brahma-fi/console-automation-examples/internal/integrations"
	"github.com/Brahma-fi/console-automation-examples/utils/keymanager"
	"github.com/ethereum/go-ethereum/ethclient"
)

type integrationStorage struct {
	MorphoClient  *integrations.MorphoClient
	ConsoleClient *integrations.ConsoleClient
	KeyManager    *keymanager.KeyManager
}

func newIntegrationStorage(c *config.Config) (*integrationStorage, error) {
	is := &integrationStorage{}
	rpc, err := ethclient.Dial(c.BaseRpcURL)
	if err != nil {
		return nil, err
	}

	is.MorphoClient = integrations.NewMorphoClient(c.MorphoBaseURL, rpc)

	is.ConsoleClient = integrations.NewConsoleClient(c.ConsoleBaseURL)
	is.KeyManager, err = keymanager.NewKeyManager(c.ExecutorKey)
	if err != nil {
		return nil, err
	}

	return is, nil
}
