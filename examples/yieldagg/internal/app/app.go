package app

import (
	"context"

	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/ethereum/go-ethereum/common"
)

func Run() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cfg, err := config.LoadConfig(ctx)
	if err != nil {
		return err
	}

	is, err := newIntegrationStorage(cfg)
	if err != nil {
		return err
	}

	ss, err := newServiceStorage(ctx, cfg, is)
	if err != nil {
		return err
	}

	addr := common.HexToAddress("")
	return ss.Strategy.Run(ctx, addr, false)
}
