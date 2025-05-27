// Helpers scripts for serverless.yml
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

async function getGlAccountDetails() {
  const region = process.env.AWS_REGION;
  const ssmClient = new SSMClient({ region });
  const command = new GetParameterCommand({
    Name: `/GL/ACCOUNT_DETAILS`,
    WithDecryption: true,
  });
  const response = await ssmClient.send(command);
  const glBuild = JSON.parse(response.Parameter.Value);

  return {
    accountid: glBuild.accountid,
    accountname: glBuild.accountname,
    dynamoParameters: glBuild.dynamoParameters,
  };
}

module.exports.logRetentionInDays = () => {
  return {
    ci: 7,
    qa: 7,
    po: 7,
    uat: 7,
    stg: 7,
    primary: 3653,
  };
};

module.exports.canaryDeploymentType = () => {
  return {
    ci: "AllAtOnce",
    qa: "AllAtOnce",
    po: "AllAtOnce",
    uat: "AllAtOnce",
    stg: "AllAtOnce",
    primary: "AllAtOnce",
  };
};

module.exports.elasticTempIndex = () => {
  return {
    ci: "transactions",
    qa: "transactions",
    po: "transactions",
    uat: "transactions",
    stg: "transactions",
    primary: "transactions",
  };
};

module.exports.awsRegion = () => {
  return {
    ci: "us-east-1",
    qa: "us-east-1",
    uat: "us-east-1",
    stg: "us-east-1",
    po: "us-east-1",
    primary: "us-east-1",
  };
};

module.exports.enqueueAutomaticVoidPreAuthACQ = () => {
  const cron = "cron(0 11 * * ? *)"; // Every day at 6am ( UTC-5 )
  const fake = "rate(3653 days)";
  return {
    ci: fake,
    qa: fake,
    uat: cron,
    stg: fake,
    po: fake,
    primary: cron,
  };
};

module.exports.getParameters = async () => {
  return await getGlAccountDetails();
};
