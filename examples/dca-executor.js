import Axios from "axios";
import ethers, { BigNumber } from "ethers";
import { setIntervalAsync } from "set-interval-async";

/// Import ERC20 ABI
import ERC20_ABI from "../abi/erc20.json";
/// Import Safe ABI
import SAFE_ABI from "../abi/safe.json";

/// Chain ID
const CHAIN_ID = 1;
/// RPC url
const RPC_URL = "...";

/// CRV token address on selected chain
const CRV_TOKEN_ADDRESS = "0xD533a949740bb3306d119CC777fa900bA034cd52";
/// USDC token address on selected chain
const USDC_TOKEN_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

/// address of executor
const EXECUTOR_ADDRESS = "...";
/// address of ExecutorPlugin contract
const EXECUTOR_PLUGIN_ADDRESS = "...";
/// executor's private key
const EXECUTOR_PK = "...";
/// Console API's base url
const CONSOLE_API_BASE_URL = "...";

/// Desired DCA Interval in milliseconds
const DCA_INTERVAL = 1000 * 60 * 60 * 24 * 7; // weekly
/// Desired amount to DCA (decimals normalized)
const DCA_AMOUNT = 10;

const convertTokenToToken = (inputToken, outputToken, amount) => {
  /// Populate function with logic to generate calldata to swap `inputToken` -> `outputToken` via preferred DEX
  const callData = "...";
  return callData;
};

const fetchAllAccounts = async (chainId) => {
  /// Get list of all accounts where `EXECUTOR_ADDRESS` is an executor
  const { data: response } = await Axios.get(
    `${CONSOLE_API_BASE_URL}/accounts/user/executable/${EXECUTOR_ADDRESS}/${chainId}`
  );

  return response.data;
};

export const buildExecutionDigestSignature = async (
  chainId,
  to,
  value,
  data,
  operation,
  account,
  nonce
) => {
  /// Build ExecutionParams digest
  const types = {
    ExecutionParams: [
      { name: "operation", type: "uint8" },
      { name: "to", type: "address" },
      { name: "account", type: "address" },
      { name: "executor", type: "address" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "data", type: "bytes" }
    ]
  };

  const executorPluginDomain = {
    name: "ExecutorPlugin",
    version: "1.0",
    chainId: chainId,
    verifyingContract: EXECUTOR_PLUGIN_ADDRESS
  };

  const executionParamsData = {
    to,
    value,
    data,
    operation,
    account,
    executor: EXECUTOR_ADDRESS,
    nonce,
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: 0
  };

  /// Sign execution digest with Executor's private key
  const signer = new ethers.Wallet(EXECUTOR_PK);
  const signature = await signer._signTypedData(
    executorPluginDomain,
    types,
    executionParamsData
  );

  return signature;
};

const buyCRV = async (accountAddresses, chainId) => {
  /// Convert desired USDC balance at given interval to CRV
  const executionRequests = [];
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const usdcToken = new ethers.Contract(
    USDC_TOKEN_ADDRESS,
    ERC20_ABI,
    provider
  );

  for (const account of accountAddresses) {
    /// Get safe contract implementation
    const safeContract = new ethers.Contract(account, SAFE_ABI, provider);
    /// Get calldata to convert the user's USDC balance to CRV
    const accountUSDCBalance = await usdcToken.balanceOf(account);

    /// If account has sufficient balance, then DCA buy
    if (accountUSDCBalance.gte(BigNumber.from(DCA_AMOUNT))) {
      const conversionCallData = convertTokenToToken(
        USDC_TOKEN_ADDRESS,
        CRV_TOKEN_ADDRESS,
        accountUSDCBalance.toString()
      );

      const executable = {
        // CALL
        callType: 0,
        /// Replace with intended contract to perform swap
        target: "...",
        value: 0,
        data: conversionCallData
      };

      /// Generate signature for execution digest
      const executorSignature = buildExecutionDigestSignature(
        chainId,
        executable.target,
        executable.value,
        executable.data,
        executable.callType,
        account,
        (await safeContract.nonce()).toString()
      );

      /// Push requests
      executionRequests.push({
        executable,
        account,
        executorSignature,
        executor: EXECUTOR_ADDRESS
      });
    }

    /// Send execution requests to be validated by backend and executed via relayer
    const { data: relayerResponse } = await Axios.post(
      `${CONSOLE_API_BASE_URL}/accounts/relayer/execute`,
      executionRequests
    );

    if (!!relayerResponse.error) console.error(relayerResponse.error);
    else {
      /// Every 30 seconds, check status, and log if success
      let success = false;
      while (!success) {
        const { data: statusResponse } = await Axios.get(
          `${CONSOLE_API_BASE_URL}/relayer/tasks/status/${relayerResponse.trackingId}`
        );
        if (statusResponse?.data?.metadata?.response?.isSuccessful) {
          console.log(
            `[SUCCESS] ${statusResponse.data.metadata.response.transactionHash}`
          );
          success = true;
        }

        /// Sleep 30 seconds
        await new Promise((r) => setTimeout(r, 30000));
      }
    }
  }
};

const main = async () => {
  /// Buy CRV at every `DCA_INTERVAL` for every account where executor is enabled
  setIntervalAsync(async () => {
    const accounts = await fetchAllAccounts(CHAIN_ID);
    await buyCRV(accounts, CHAIN_ID);
  }, DCA_INTERVAL);
};

/// RUN
main();
