import dotenv from "dotenv";
import { Wallet, providers, BigNumber } from "ethers";
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

const main = async () => {
  try {
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
      logger.info(
        logMessage("Found Subscriptions", JSON.stringify(subscriptions,'',4))
      );

      for (let subscription of subscriptions) {
        const metadata = subscription.metadata;
        let refuel = false;
        let targetChainID = 0;
        let subaccount = subscription.subAccountAddress;
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
          logger.info(logMessage("Generating Bridging Quote", ""));
          const quote = await getQuote(
            BASE_CHAIN_ID,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            targetChainID,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            metadata.amount,
            subaccount,
            metadata.refuelAddress,
            true,
            "time",
            true
          );

          const route = quote.result.routes[0];
          logger.info(logMessage("Quote", JSON.stringify(route)));

          const apiReturnData = await getRouteTransactionData(route);
          logger.info(logMessage("Call Data", JSON.stringify(apiReturnData)));

          const executable = {
            callType: 0,
            to: apiReturnData.result.txTarget,
            value: BigNumber.from(apiReturnData.result.value).toString(),
            data: apiReturnData.result.txData,
          };

          const executorSignature = await signCallData(
            subaccount,
            EXECUTOR_ADDRESS,
            executable,
            signer,
            BASE_CHAIN_ID,
            CHAIN_ID_2_RPC_URL[`${BASE_CHAIN_ID}`]
          );
          logger.info(logMessage("Executor Signature", executorSignature));

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
          logger.info(logMessage("Waiting for intent finalization"))
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
