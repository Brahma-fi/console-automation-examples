package pretty

import (
	"os"

	"github.com/Brahma-fi/console-automation-examples/internal/entity"
	"github.com/jedib0t/go-pretty/v6/table"
)

func RenderVaults(vaults []entity.VaultInfo) {
	t := table.NewWriter()
	t.SetStyle(table.StyleColoredCyanWhiteOnBlack)
	t.SetOutputMirror(os.Stdout)
	t.AppendHeader(table.Row{"-", "ID", "Vault", "Address", "APY"})
	for i, vault := range vaults {
		t.AppendRow([]interface{}{i + 1, vault.Id, vault.Symbol, vault.Address, vault.State.NetApy * 100})
		t.AppendSeparator()
	}
	t.AppendSeparator()
	t.Render()
}
