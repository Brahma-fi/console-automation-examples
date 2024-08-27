package app

import (
	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/Brahma-fi/console-automation-examples/internal/integrations"
	"github.com/ethereum/go-ethereum/ethclient"
)

type integrationStorage struct {
	morphoClient *integrations.MorphoClient
}

func newIntegrationStorage(c *config.Config) (*integrationStorage, error) {
	is := &integrationStorage{}
	rpc, err := ethclient.Dial(c.BaseRpcURL)
	if err != nil {
		return nil, err
	}

	is.morphoClient = integrations.NewMorphoClient(c.MorphoBaseURL, rpc)
	return is, nil
}
