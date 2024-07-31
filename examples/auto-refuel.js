import dotenv from "dotenv";
import { Wallet, providers, BigNumber, utils } from "ethers";
import chalk from "chalk";
import winston from "winston";
dotenv.config();

const EXECUTOR_SIGNING_KEY = process.env.EXECUTOR_SIGNING_KEY || "";
const CHAIN_ID_2_RPC_URL = JSON.parse(process.env.CHAIN_ID_2_RPC_URL) || "";

import {
  fetchExecutorByAddress,
  fetchActiveSubscriptions,
  signCallData,
  executeTask,
} from "./console/helpers.js";

import { getQuote, getRouteTransactionData } from "./socket/bridging.js";

const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;
const BASE_CHAIN_ID = 42161;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

const gasStationLogo = `
██████  ███████ ███████ ██    ██ ███████ ██            ███    ██ ███████ ████████ ██     ██  ██████  ██████  ██   ██ 
██   ██ ██      ██      ██    ██ ██      ██            ████   ██ ██         ██    ██     ██ ██    ██ ██   ██ ██  ██  
██████  █████   █████   ██    ██ █████   ██      █████ ██ ██  ██ █████      ██    ██  █  ██ ██    ██ ██████  █████   
██   ██ ██      ██      ██    ██ ██      ██            ██  ██ ██ ██         ██    ██ ███ ██ ██    ██ ██   ██ ██  ██  
██   ██ ███████ ██       ██████  ███████ ███████       ██   ████ ███████    ██     ███ ███   ██████  ██   ██ ██   ██ 
                                                                                                                     
                                                                                                                                                                                                                    
`;

logger.info(chalk.magenta(gasStationLogo));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const second = 1000;

const logMessage = (action, details) => {
  return `${chalk.cyan(action)} - ${chalk.yellow(details)}`;
};

const canExecute = async (targetChainID, target, threshold) => {
  const provider = new providers.JsonRpcProvider(
    CHAIN_ID_2_RPC_URL[`${targetChainID}`]
  );

  const bal = await provider.getBalance(target);
  logger.info(
    logMessage(
      "CanExecute Check",
      `Current balance: ${bal.toString()}, Threshold: ${threshold.toString()}`
    )
  );

  if (bal.gt(threshold)) {
    return false;
  }

  return true;
};

const maxBalance = async (address, targetChainID) => {
  const provider = new providers.JsonRpcProvider(
    CHAIN_ID_2_RPC_URL[`${targetChainID}`]
  );

  const bal = await provider.getBalance(address);
  return bal.toString();
};

// If rugAddress is set to true, the script will try to withdraw the given funds to the executor's address
// instead of the bridging contract
let rugAddress = false;

// If rugAmount is set to true, the script will try to bridge all the balance of the sub-account
// which will violate the policy if setup correctly
let rugAmount = false;

const main = async () => {
  try {
    // Fetch executor metadata which contains policies and configuration
    // Example:
    /*
        {
            "chainId": 42161,
            "config": {
                "feeInBPS": 0,
                "feeReceiver": "0xae75b29ade678372d77a8b41225654138a7e6ff1",
                "feeToken": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
                "hopAddresses": [
                    "0x3a23f943181408eac424116af7b7790c94cb97a5"
                ],
                "inputTokens": [
                    "0x0000000000000000000000000000000000000000"
                ],
                "limitPerExecution": true
            },
            "executor": "0xae75b29ade678372d77a8b41225654138a7e6ff1",
            "executorMetadata": {
                "id": "auto-refuel",
                "logo": "",
                "metadata": {},
                "name": "REFUEL-NETWORK"
            },
            "id": "259d6ce7-1008-43dc-8f48-f7c53354d194",
            "signature": "0x60f6aaeed71dc8c27a6a15354f46c097873f7712b20c1848af02cc267cd914fd2a77c5d57fdd26e5928c82c81d84834c311310bd463ac59eadb7ca9329af80431b",
            "status": 1,
            "timestamp": 1
        }
    */
    const metadata = await fetchExecutorByAddress(
      EXECUTOR_ADDRESS,
      BASE_CHAIN_ID
    );
    logger.info(
      logMessage("Fetched Executor Metadata", JSON.stringify(metadata, "", 4))
    );

    const provider = new providers.JsonRpcProvider(
      CHAIN_ID_2_RPC_URL[`${BASE_CHAIN_ID}`]
    );
    const signer = new Wallet(EXECUTOR_SIGNING_KEY, provider);

    while (true) {
      process.stdout.write(
        logMessage(
          `${new Date().toTimeString()} Fetching Subscriptions`,
          "..."
        ) + "\r"
      );

      // Fetch active subscriptions for the executor
      // Example:
      /*
        [
        {
            "chainId": 42161,
            "commitHash": "0x7f8c52bd5e691fd15398eb8097585d1572152defeb2b42e2f34c6f4b20cea15e",
            "createdAt": "2024-07-31T08:25:48.469066Z",
            "duration": 0,
            "feeAmount": "0",
            "feeToken": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
            "id": "50ad43f1-b44f-442b-b7e5-e5df041b223a",
            "metadata": {
                "amount": "1000000000000000",
                "chains": [
                    8453,
                    34443
                ],
                "minAmount": "150000000000000",
                "refuelAddress": "0xAb3BCd63A3938031c27b122Ec2B7F87Ec0Ba472A"
            },
            "registryId": "259d6ce7-1008-43dc-8f48-f7c53354d194",
            "status": 2,
            "subAccountAddress": "0x3e26fe336ebae6135a3ae1600f13a01a1d2510c4",
            "tokenInputs": {
                "0x0000000000000000000000000000000000000000": "2000000000000000"
            },
            "tokenLimits": {
                "0x0000000000000000000000000000000000000000": "0.001"
            }
        }
    ]
    */
      let subscriptions = await fetchActiveSubscriptions(metadata.id);
      if (subscriptions.length == 0) {
        process.stdout.write(
          logMessage(
            `${new Date().toTimeString()} No Subscriptions Found`,
            "..."
          ) + "\r"
        );
        await delay(5 * second);
        continue;
      }

      process.stdout.write("\n");
      logger.info(
        logMessage("Found Subscriptions", JSON.stringify(subscriptions, "", 4))
      );

      for (let subscription of subscriptions) {
        const metadata = subscription.metadata;
        let refuel = false;
        let targetChainID = 0;
        let subaccount = subscription.subAccountAddress;
        // Check if refuel is needed for any of the target chains
        for (let targetChain of metadata.chains) {
          if (
            await canExecute(
              targetChain,
              metadata.refuelAddress,
              metadata.minAmount
            )
          ) {
            refuel = true;
            targetChainID = targetChain;
            break;
          }
        }
        if (refuel) {
          let amount = rugAmount
            ? await maxBalance(subaccount, BASE_CHAIN_ID)
            : metadata.amount;
          logger.info(
            logMessage(
              "withdrawing amount",
              utils.formatEther(BigNumber.from(amount))
            )
          );
          let executable = {};
          if (!rugAddress) {
            logger.info(logMessage("Generating Bridging Quote", ""));

            // Get quote for bridging
            const quote = await getQuote(
              BASE_CHAIN_ID,
              "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              targetChainID,
              "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              amount,
              subaccount,
              metadata.refuelAddress,
              true,
              "time",
              true
            );

            const route = quote.result.routes[0];
            logger.info(logMessage("Quote", JSON.stringify(route)));

            // Get transaction data for the route
            const apiReturnData = await getRouteTransactionData(route);
            logger.info(
              logMessage("Call Data", JSON.stringify(apiReturnData, "", 2))
            );

            // Prepare executable transaction data
            executable = {
              callType: 0,
              to: apiReturnData.result.txTarget,
              value: BigNumber.from(apiReturnData.result.value).toString(),
              data: apiReturnData.result.txData,
            };
          } else {
            // Prepare executable transaction data for rug call
            executable = {
              callType: 0,
              to: EXECUTOR_ADDRESS,
              value: BigNumber.from(amount).toString(),
              data: "0x",
            };
            logger.info(
              logMessage(
                "executing rug call",
                JSON.stringify(executable, "", 4)
              )
            );
          }

          // Sign the call data
          const executorSignature = await signCallData(
            subaccount,
            EXECUTOR_ADDRESS,
            executable,
            signer,
            BASE_CHAIN_ID,
            CHAIN_ID_2_RPC_URL[`${BASE_CHAIN_ID}`]
          );
          logger.info(logMessage("Executor Signature", executorSignature));

          // Execute the task
          const taskExecResponse = await executeTask({
            chainId: BASE_CHAIN_ID,
            executable,
            subaccount,
            executorSignature,
            executor: EXECUTOR_ADDRESS,
          });

          logger.info(
            logMessage("Executed Task", JSON.stringify(taskExecResponse, "", 4))
          );

          // wait before next run
          logger.info(logMessage("Waiting for intent finalization", "~2 mins"));
          await delay(60 * second);
        } else {
          await delay(5 * second);
        }
      }
    }
  } catch (err) {
    logger.error(logMessage("Error", err.toString()));
  }
};

main();
