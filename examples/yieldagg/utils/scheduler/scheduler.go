package scheduler

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Brahma-fi/console-automation-examples/utils/logger"
	"go.uber.org/zap"
)

type ExecutionTimeCtxKey struct{}

func Schedule(ctx context.Context, duration time.Duration, run func(ctx context.Context) error) error {
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	log := logger.NewLogger("scheduler")
	ticker := time.NewTicker(duration)
	log.Info("starting scheduler", zap.Duration("every", duration))

	ctx = context.WithValue(ctx, ExecutionTimeCtxKey{}, time.Now().Unix())
	log.Info("executing", zap.Time("now", time.Now()))
	if err := run(ctx); err != nil {
		log.Error("failed to execute strategy", zap.Error(err))
	}

	for {
		select {
		case <-ticker.C:
			ctx = context.WithValue(ctx, ExecutionTimeCtxKey{}, time.Now().Unix())
			log.Info("executing", zap.Time("now", time.Now()))
			if err := run(ctx); err != nil {
				log.Error("failed to execute strategy", zap.Error(err))
			}
		case s := <-interrupt:
			log.Info("interrupt : " + s.String())
			return errors.New("scheduler exited")
		}
	}
}
