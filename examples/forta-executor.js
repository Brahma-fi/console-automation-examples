const Axios = require("axios");
const { ethers } = require("ethers");
const { setIntervalAsync } = require("set-interval-async");

/// Import ERC20 ABI
const ERC20_ABI = require("../abi/erc20.json");
/// Import ExecutorPlugin ABI
const EXECUTOR_PLUGIN_ABI = require("../abi/executorPlugin.json");

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

/// Your automation registry ID
let RegistryID;
/// your client console address
const CLIENT_CONSOLE_ADDRESS = "...";
const CLIENT_ID = CLIENT_CONSOLE_ADDRESS;

/// executor's private key
const EXECUTOR_PK = "...";
/// Console API's base url
const CONSOLE_API_BASE_URL = "...";
/// Your forta API url
const FORTA_API_URL = "https://api.forta.network/graphql";
/// Your forta API Key
const FORTA_API_KEY = "...";

const EXECUTION_CONFIG = {
  /// NOTE: in case of multiple input tokens, separate them by commas
  inputTokens: CRV_TOKEN_ADDRESS,
  /// NOTE: in case of multiple output tokens, separate them by commas
  outputTokens: USDC_TOKEN_ADDRESS,
  /// NOTE: comma separated addresses of venues to hop through during swap
  swapVenues: "...",
  /// NOTE: replace with the desired fee in BPS for your automation
  feeBps: 10
};

const convertTokenToToken = (inputToken, outputToken, amount) => {
  /// Populate function with logic to generate calldata to swap `inputToken` -> `outputToken` via preferred DEX
  const callData = "...";
  return callData;
};

const fetchAllAccounts = async (chainId) => {
  /// Get list of all accounts where consoles are registered to `RegistryID`
  const { data: response } = await Axios.get(
    `${CONSOLE_API_BASE_URL}/v1/automations/jobs/subscribers/${CLIENT_CONSOLE_ADDRESS}/${EXECUTOR_ADDRESS}/${chainId}`
  );

  return response?.data || [];
};

const getRegistrationParamsData = (timestamp) => ({
  timestamp: timestamp,
  clientId: CLIENT_ID,
  feeInBPS: EXECUTION_CONFIG.feeBps,
  safeExecutor: EXECUTOR_ADDRESS,
  /// NOTE: eoaExecutor must be zero
  eoaExecutor: ethers.constants.AddressZero,
  inputTokens: EXECUTION_CONFIG.inputTokens,
  outputTokens: EXECUTION_CONFIG.outputTokens,
  swapVenues: EXECUTION_CONFIG.swapVenues,
  action: "create"
});

export const buildClientAutomationRegistrationSignature = async (timestamp) => {
  const types = {
    ClientAutomationRegistry: [
      {
        name: "timestamp",
        type: "uint256"
      },
      {
        name: "clientId",
        type: "string"
      },
      {
        name: "feeInBPS",
        type: "uint256"
      },
      {
        name: "safeExecutor",
        type: "address"
      },
      {
        name: "eoaExecutor",
        type: "address"
      },
      {
        name: "inputTokens",
        type: "string"
      },
      {
        name: "outputTokens",
        type: "string"
      },
      {
        name: "swapVenues",
        type: "string"
      },
      {
        name: "action",
        type: "string"
      }
    ]
  };

  const clientAutomationRegistryDomain = {
    chainId: CHAIN_ID
  };

  const registrationParamsData = getRegistrationParamsData(timestamp);
  const signer = new ethers.Wallet(EXECUTOR_PK);
  const signature = await signer._signTypedData(
    clientAutomationRegistryDomain,
    types,
    registrationParamsData
  );

  return signature;
};

const buildExecutionDigestSignature = async (
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
    gasToken: ethers.constants.AddressZero,
    refundReceiver: ethers.constants.AddressZero,
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

  /// Query scam reports from forta API
  const { data: response } = await Axios.post(
    FORTA_API_URL,
    { query, variables },
    { headers: { Authorization: `bearer ${FORTA_API_KEY}` } }
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
    /// Get CRV token contract
    const crvToken = new ethers.Contract(
      CRV_TOKEN_ADDRESS,
      ERC20_ABI,
      provider
    );
    /// Get executor plugin implementation
    const executorPluginContract = new ethers.Contract(
      EXECUTOR_PLUGIN_ADDRESS,
      EXECUTOR_PLUGIN_ABI,
      provider
    );

    for (const account of accountAddresses) {
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
        to: "...",
        value: 0,
        data: conversionCallData
      };

      /// Generate signature for execution digest
      const executorSignature = buildExecutionDigestSignature(
        chainId,
        executable.to,
        executable.value,
        executable.data,
        executable.callType,
        account,
        (
          await executorPluginContract.executorNonce(account, EXECUTOR_ADDRESS)
        ).toString()
      );

      /// Push requests
      executionRequests.push({
        executable,
        subaccount: account,
        executorSignature,
        executor: EXECUTOR_ADDRESS
      });
    }

    /// Send execution requests to be validated by backend and executed via relayer
    for (const executionRequest of executionRequests) {
      const { data: relayerResponse } = await Axios.post(
        `${CONSOLE_API_BASE_URL}/v1/automations/tasks/execute/${chainId}`,
        {
          task: executionRequest
        }
      );

      try {
        {
          /// Every 30 seconds, check status, and log if executed
          let executed = false;
          while (!executed) {
            const { data: statusResponse } = await Axios.get(
              `${CONSOLE_API_BASE_URL}/v1/relayer/tasks/status/${relayerResponse.data.taskId}`
            );
            if (statusResponse?.data?.metadata?.response?.isSuccessful) {
              console.log(
                `[SUCCESS] ${statusResponse.data.metadata.response.transactionHash}`
              );
              executed = true;
            }
            if (statusResponse?.data?.metadata?.response?.error?.length) {
              /// handle failure as required
              console.log(
                `[FAILED] ${statusResponse.data.metadata.response.error}`
              );
              executed = false;
            }
            /// Sleep 20 seconds
            await new Promise((r) => setTimeout(r, 20000));
          }
        }
      } catch (err) {
        /// handle error as required
        console.error(
          `validation error on account; ${executionRequest.subaccount}`,
          err
        );
      }
    }
  }
};

const registerClientAutomation = async (chainId) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const signature = await buildClientAutomationRegistrationSignature(
    currentTimestamp
  );

  const { data: automationRegistrationResponse } = await Axios.post(
    `${CONSOLE_API_BASE_URL}/v1/automations/registries/${CLIENT_CONSOLE_ADDRESS}`,
    {
      signer: CLIENT_CONSOLE_ADDRESS,
      signature: signature,
      data: {
        domain: {
          chainId
        },
        message: getRegistrationParamsData(timestamp)
      }
    }
  );

  return automationRegistrationResponse?.data?.id || "";
};

const main = async () => {
  /// register client automation
  try {
    const registryId = await registerClientAutomation(CHAIN_ID);
    if (registryId === "") console.error("automation registry creation failed");
    else RegistryID = registryId;
  } catch (err) {
    console.error("automation registry creation failed", err);
  }
  /// Assuming there are subscribed subaccounts for the automation
  /// Scan reports & perform liquidations every hour
  setIntervalAsync(async () => {
    const accounts = await fetchAllAccounts(CHAIN_ID);
    await liquidateCRVWhenScamDetected(accounts, CHAIN_ID);
  }, 1000 * 60 * 60);
};

/// RUN
main();
