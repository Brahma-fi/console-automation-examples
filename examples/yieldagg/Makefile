.PHONY: gen-abis
gen-abis:
		mkdir -p ./utils/abis/metamorpho	&& abigen --abi=./utils/abis/json/meta_morpho.json --pkg=utils --type=morpho --out=./utils/abis/metamorpho/binding.go
		mkdir -p ./utils/abis/executorplugin	&& abigen --abi=./utils/abis/json/executor_plugin.json --pkg=utils --type=executorplugin --out=./utils/abis/executorplugin/binding.go
		mkdir -p ./utils/abis/erc20	&& abigen --abi=./utils/abis/json/erc20.json --pkg=utils --type=erc20 --out=./utils/abis/erc20/binding.go