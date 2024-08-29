package app

import (
	"context"
	"time"

	"github.com/Brahma-fi/console-automation-examples/config"
	"github.com/Brahma-fi/console-automation-examples/utils/scheduler"
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

	if err = ss.Strategy.Strategies(ctx); err != nil {
		return err
	}

	return scheduler.Schedule(ctx, time.Second*60, ss.Strategy.Run)
}
