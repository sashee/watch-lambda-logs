import {promisify} from "util";
import {exec} from "child_process";
import inquirer from "inquirer";
import AWS from "aws-sdk";
import arnParser from "aws-arn";
import _ from "lodash/fp";

const getFunctionFromTerraform = async () => {
	const filterDeepObject = (iteratee) => (root) => {
		if (Array.isArray(root)) {
			return _.flatten([...root.map(filterDeepObject(iteratee))]);
		}else if (root !== null && typeof root === "object") {
			return _.flatten([iteratee(root) ? [root] : [], ...Object.values(root).map(filterDeepObject(iteratee))]);
		}else {
			return [];
		}
	};

	const {stdout} = await promisify(exec)("terraform show -json");
	const functions = filterDeepObject((obj) => obj.type === "aws_lambda_function")(JSON.parse(stdout));
	const selectedFunction = await (async () => {
		if (functions.length === 0) {
			throw new Error("no functions are managed by Terraform");
		}else if (functions.length === 1) {
			return {"function": functions[0]};
		}else {
			return inquirer.prompt([{type: "list", name: "function", message: "Lambda function", choices: functions.map((fn) => ({name: `[${fn.address}] ${fn.values.function_name}`, value: fn}))}]);
		}
	})();
	return {
		functionName: selectedFunction.function.values.function_name,
		region: arnParser.parse(selectedFunction.function.values.arn).region,
	};
};

const getLogEvents = async (functionName, region) => {
	const cloudwatchlogs = new AWS.CloudWatchLogs({region: region});

	const logStream = await cloudwatchlogs.describeLogStreams({
		logGroupName: `/aws/lambda/${functionName}`,
		orderBy: "LastEventTime",
		descending: true,
		limit: 1,
	}).promise();

	const logs = await (async () => {
		if (logStream.logStreams.length === 0) {
			return [];
		}else {
			const logStreamName = logStream.logStreams[0].logStreamName;
			const events = await cloudwatchlogs.getLogEvents({
				logGroupName: `/aws/lambda/${functionName}`,
				logStreamName,
				startFromHead: false,
				limit: 100,
			}).promise();

			return events.events.sort((event1, event2) => event1.timestamp - event2.timestamp); // ascending
		}
	})();
	return logs;
};

export const cli = async (args) => {
	const functionArg = args[2];
	const fn = await (async () => {
		if (functionArg) {
			if (functionArg.startsWith("arn:")) {
				const parsed = arnParser.parse(functionArg);
				return {
					functionName: parsed.resourcePart.replace(/^(function:)/, ""),
					region: parsed.region,
				};
			}else {
				return {functionName: functionArg};
			}
		}else {
			return getFunctionFromTerraform();
		}
	})();
	const printLatestMessages = async () => {
		const logs = await getLogEvents(fn.functionName, fn.region);

		console.clear();
		console.log(logs.map(({timestamp, message}) => `[${new Date(timestamp).toLocaleString()}] ${message}`).join(""));
		setTimeout(printLatestMessages, 2000);
	};
	setTimeout(printLatestMessages, 2000);
};
