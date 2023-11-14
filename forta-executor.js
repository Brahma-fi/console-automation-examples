import Axios from "axios";
import ethers from "ethers";
import { setIntervalAsync } from "set-interval-async";

/// Import ERC20 ABI
const ERC20_ABI = "...";
/// Import Safe ABI
const SAFE_ABI = "...";

const HEX_BASE = 16;

/// CRV token address on selected chain
const CRV_TOKEN_ADDRESS = "...";
/// USDC token address on selected chain
const USDC_TOKEN_ADDRESS = "...";

/// address of executor
const EXECUTOR_ADDRESS = "...";
/// address of ExecutorPlugin contract
const EXECUTOR_PLUGIN_ADDRESS = "...";
/// executor's private key
const EXECUTOR_PK = "...";
/// Console API's base url
const CONSOLE_API_BASE_URL = "...";
/// RPC url
const RPC_URL = "...";
/// Your forta API url
const FORTA_API_URL = "https://api.forta.network/graphql";

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

const queryCRVScamReport = async (chainId) => {
  /// Query Forta's scam detector bot to detect any potential scams
  const query = `
        query Labels($input: LabelsInput) {
            labels(input: $input) {
            labels {
                label {
                entity
                confidence
                }
            }
            }
        }
    `;

  const variables = {
    input: {
      sourceIds: [
        /// Forta scam detector feed source ID
        "0x1d646c4045189991fdfd24a66b192a294158b839a6ec121d740474bdacb3ab23"
      ],
      labels: ["scammer"],
      state: true,
      metadata: {
        chain_id: chainId
      }
    }
  };

  /// Replace with your Forta API Key
  const { data: response } = await Axios.post(
    FORTA_API_URL,
    { query, variables },
    { headers: { Authorization: `bearer ...` } }
  );
  const scamReports = response?.data?.labels?.labels || [];

  /// Find any scam reports involving CRV address, with confidence greater than 60%
  const crvScamReport = scamReports.find(
    (report) => report?.entity === CRV_TOKEN_ADDRESS && report?.confidence > 0.6
  );

  return crvScamReport;
};

const liquidateCRVWhenScamDetected = async (accountAddresses, chainId) => {
  const crvScamReport = await queryCRVScamReport(chainId);

  /// If valid CRV scam report found, send execution requests
  /// to convert all CRV -> USDC
  if (!!crvScamReport) {
    const executionRequests = [];
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const crvToken = new ethers.Contract(
      CRV_TOKEN_ADDRESS,
      ERC20_ABI,
      provider
    );

    for (const account of accountAddresses) {
      /// Get safe contract implementation
      const safeContract = new ethers.Contract(account, SAFE_ABI, provider);
      /// Get calldata to convert the user's CRV balance to USDC
      const accountCRVBalance = (await crvToken.balanceOf(account)).toString();
      const conversionCallData = convertTokenToToken(
        CRV_TOKEN_ADDRESS,
        USDC_TOKEN_ADDRESS,
        accountCRVBalance
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
  /// Scan reports & perform liquidations every hour
  setIntervalAsync(async () => {
    /// Get chain ID from RPC
    const currentChainIdHex = await new ethers.providers.JsonRpcProvider(
      RPC_URL
    ).send("eth_chainId", []);
    const currentChainId = parseInt(currentChainIdHex, HEX_BASE);

    const accounts = await fetchAllAccounts(currentChainId);
    await liquidateCRVWhenScamDetected(accounts, currentChainId);
  }, 1000 * 60 * 60);
};

/// RUN
main();
