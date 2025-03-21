import readline from "readline";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { 
  S3Client, 
  CreateBucketCommand,
  PutBucketEncryptionCommand
} from "@aws-sdk/client-s3";
import { 
  EC2Client, 
  RunInstancesCommand, 
  CreateTagsCommand
} from "@aws-sdk/client-ec2";
import { 
  RDSClient, 
  CreateDBInstanceCommand 
} from "@aws-sdk/client-rds";
import { 
  LambdaClient, 
  CreateFunctionCommand 
} from "@aws-sdk/client-lambda";
import { 
  IAMClient, 
  AttachRolePolicyCommand 
} from "@aws-sdk/client-iam";

dotenv.config();

// API configurations
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// AWS credential setup
let AWS_CREDENTIALS = {
  accessKeyId: null,
  secretAccessKey: null,
  region: null,
  policyArn: null
};

// Function to set up AWS credentials
function setupAWSCredentials(accessKeyId, secretAccessKey, region, policyArn) {
  AWS_CREDENTIALS.accessKeyId = accessKeyId;
  AWS_CREDENTIALS.secretAccessKey = secretAccessKey;
  AWS_CREDENTIALS.region = region;
  AWS_CREDENTIALS.policyArn = policyArn;
  
  return "AWS credentials configured successfully.";
}

// EC2 Deployment Function
async function deployEC2(instanceName, instanceType, amiId, keyName, securityGroupId, userData) {
  try {
    // Validate AWS credentials
    if (!validateAWSCredentials()) {
      return "AWS credentials not configured. Please set up your credentials first.";
    }

    const ec2Client = new EC2Client({
      region: AWS_CREDENTIALS.region,
      credentials: {
        accessKeyId: AWS_CREDENTIALS.accessKeyId,
        secretAccessKey: AWS_CREDENTIALS.secretAccessKey
      }
    });

    // Create instance parameters
    const params = {
      ImageId: amiId || "ami-0c55b159cbfafe1f0", // Default Amazon Linux 2 AMI
      InstanceType: instanceType || "t2.micro",
      MinCount: 1,
      MaxCount: 1,
      KeyName: keyName,
      SecurityGroupIds: securityGroupId ? [securityGroupId] : undefined,
      UserData: userData ? Buffer.from(userData).toString('base64') : undefined
    };

    // Launch the instance
    const command = new RunInstancesCommand(params);
    const response = await ec2Client.send(command);
    
    const instanceId = response.Instances[0].InstanceId;
    
    // Add tags to the instance
    if (instanceName) {
      const tagParams = {
        Resources: [instanceId],
        Tags: [
          {
            Key: "Name",
            Value: instanceName
          }
        ]
      };
      
      const tagCommand = new CreateTagsCommand(tagParams);
      await ec2Client.send(tagCommand);
    }
    
    return `EC2 instance ${instanceId} deployed successfully with name ${instanceName || "No name provided"}.`;
  } catch (error) {
    console.error("Error deploying EC2 instance:", error);
    return `Failed to deploy EC2 instance: ${error.message}`;
  }
}

// S3 Bucket Deployment Function
async function deployS3(bucketName, enableEncryption = true, publicAccess = false) {
  try {
    // Validate AWS credentials
    if (!validateAWSCredentials()) {
      return "AWS credentials not configured. Please set up your credentials first.";
    }

    const s3Client = new S3Client({
      region: AWS_CREDENTIALS.region,
      credentials: {
        accessKeyId: AWS_CREDENTIALS.accessKeyId,
        secretAccessKey: AWS_CREDENTIALS.secretAccessKey
      }
    });

    // Create the bucket
    const createBucketParams = {
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: AWS_CREDENTIALS.region
      }
    };
    
    const createBucketCommand = new CreateBucketCommand(createBucketParams);
    await s3Client.send(createBucketCommand);
    
    // Enable encryption if requested
    if (enableEncryption) {
      const encryptionParams = {
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: "AES256"
              }
            }
          ]
        }
      };
      
      const encryptionCommand = new PutBucketEncryptionCommand(encryptionParams);
      await s3Client.send(encryptionCommand);
    }
    
    return `S3 bucket ${bucketName} created successfully. Encryption: ${enableEncryption ? "Enabled" : "Disabled"}, Public Access: ${publicAccess ? "Allowed" : "Blocked"}.`;
  } catch (error) {
    console.error("Error creating S3 bucket:", error);
    return `Failed to create S3 bucket: ${error.message}`;
  }
}

// RDS Deployment Function
async function deployRDS(dbName, dbInstanceIdentifier, engine, instanceClass, allocatedStorage, masterUsername, masterPassword, multiAZ = false) {
  try {
    // Validate AWS credentials
    if (!validateAWSCredentials()) {
      return "AWS credentials not configured. Please set up your credentials first.";
    }

    const rdsClient = new RDSClient({
      region: AWS_CREDENTIALS.region,
      credentials: {
        accessKeyId: AWS_CREDENTIALS.accessKeyId,
        secretAccessKey: AWS_CREDENTIALS.secretAccessKey
      }
    });

    // Create RDS instance parameters
    const params = {
      DBName: dbName,
      DBInstanceIdentifier: dbInstanceIdentifier,
      AllocatedStorage: allocatedStorage || 20,
      DBInstanceClass: instanceClass || "db.t3.micro",
      Engine: engine || "mysql",
      MasterUsername: masterUsername,
      MasterUserPassword: masterPassword,
      MultiAZ: multiAZ,
      StorageType: "gp2",
      PubliclyAccessible: false,
      BackupRetentionPeriod: 7,
      AutoMinorVersionUpgrade: true
    };
    
    const command = new CreateDBInstanceCommand(params);
    await rdsClient.send(command);
    
    return `RDS database instance ${dbInstanceIdentifier} with database ${dbName} is being created. This may take several minutes to complete.`;
  } catch (error) {
    console.error("Error deploying RDS instance:", error);
    return `Failed to deploy RDS instance: ${error.message}`;
  }
}

// Lambda Deployment Function
async function deployLambda(functionName, runtime, handler, roleArn, zipFilePath, environment, memorySize = 128, timeout = 30) {
  try {
    // Validate AWS credentials
    if (!validateAWSCredentials()) {
      return "AWS credentials not configured. Please set up your credentials first.";
    }

    const lambdaClient = new LambdaClient({
      region: AWS_CREDENTIALS.region,
      credentials: {
        accessKeyId: AWS_CREDENTIALS.accessKeyId,
        secretAccessKey: AWS_CREDENTIALS.secretAccessKey
      }
    });

    // Read the ZIP file
    const fs = require('fs');
    let zipFile;
    try {
      zipFile = fs.readFileSync(zipFilePath);
    } catch (fileError) {
      return `Error reading ZIP file: ${fileError.message}`;
    }

    // Create Lambda function parameters
    const params = {
      FunctionName: functionName,
      Runtime: runtime || "nodejs14.x",
      Role: roleArn,
      Handler: handler,
      Code: {
        ZipFile: zipFile
      },
      MemorySize: memorySize,
      Timeout: timeout,
      Environment: environment ? {
        Variables: environment
      } : undefined
    };
    
    const command = new CreateFunctionCommand(params);
    await lambdaClient.send(command);
    
    return `Lambda function ${functionName} deployed successfully.`;
  } catch (error) {
    console.error("Error deploying Lambda function:", error);
    return `Failed to deploy Lambda function: ${error.message}`;
  }
}

// Validate AWS credentials
function validateAWSCredentials() {
  return (
    AWS_CREDENTIALS.accessKeyId && 
    AWS_CREDENTIALS.secretAccessKey && 
    AWS_CREDENTIALS.region
  );
}

// Attach IAM policy
async function attachIAMPolicy(roleName, policyArn) {
  try {
    // Validate AWS credentials
    if (!validateAWSCredentials()) {
      return "AWS credentials not configured. Please set up your credentials first.";
    }

    const iamClient = new IAMClient({
      region: AWS_CREDENTIALS.region,
      credentials: {
        accessKeyId: AWS_CREDENTIALS.accessKeyId,
        secretAccessKey: AWS_CREDENTIALS.secretAccessKey
      }
    });

    const params = {
      PolicyArn: policyArn || AWS_CREDENTIALS.policyArn,
      RoleName: roleName
    };
    
    const command = new AttachRolePolicyCommand(params);
    await iamClient.send(command);
    
    return `Policy ${policyArn} attached to role ${roleName} successfully.`;
  } catch (error) {
    console.error("Error attaching IAM policy:", error);
    return `Failed to attach IAM policy: ${error.message}`;
  }
}

// Cost Estimation Function
function estimateCost(resources) {
  try {
    // Basic cost estimation logic
    let totalCost = 0;
    let costBreakdown = [];
    
    for (const resource of resources) {
      let monthlyCost = 0;
      
      switch(resource.type) {
        case 'EC2':
          // Very simplified EC2 pricing
          const instancePricing = {
            't2.micro': 0.0116,
            't2.small': 0.023,
            't2.medium': 0.0464,
            't3.micro': 0.0104,
            't3.small': 0.0208,
            't3.medium': 0.0416,
            'm5.large': 0.096,
            'r5.large': 0.126
          };
          monthlyCost = (instancePricing[resource.instanceType] || 0.03) * 24 * 30;
          break;
          
        case 'S3':
          // Simplified S3 pricing (per GB per month)
          monthlyCost = (resource.storageGB || 50) * 0.023;
          break;
          
        case 'RDS':
          // Simplified RDS pricing
          const rdsInstancePricing = {
            'db.t3.micro': 0.017,
            'db.t3.small': 0.034,
            'db.t3.medium': 0.068,
            'db.m5.large': 0.155
          };
          const storageCost = (resource.storageGB || 20) * 0.115; // GP2 storage
          const instanceCost = (rdsInstancePricing[resource.instanceClass] || 0.017) * 24 * 30;
          monthlyCost = storageCost + instanceCost;
          if (resource.multiAZ) monthlyCost *= 2;
          break;
          
        case 'Lambda':
          // Lambda pricing (simplified)
          // Assuming 1M requests per month and 128MB memory
          const requestsCost = (resource.requests || 1000000) * 0.0000002;
          const computeCost = (resource.requests || 1000000) * (resource.avgDuration || 100) / 1000 * (resource.memorySize || 128) / 1024 * 0.0000166667;
          monthlyCost = requestsCost + computeCost;
          break;
      }
      
      totalCost += monthlyCost;
      costBreakdown.push({
        resource: resource.name,
        type: resource.type,
        monthlyCost: monthlyCost.toFixed(2)
      });
    }
    
    return {
      totalMonthlyCost: totalCost.toFixed(2),
      breakdown: costBreakdown
    };
  } catch (error) {
    console.error("Error estimating costs:", error);
    return {
      totalMonthlyCost: "Error",
      error: error.message
    };
  }
}

// Function to execute tool based on AI response
async function executeTool(action) {
  try {
    const availableTools = {
      "setupAWSCredentials": setupAWSCredentials,
      "deployEC2": deployEC2,
      "deployS3": deployS3,
      "deployRDS": deployRDS,
      "deployLambda": deployLambda,
      "attachIAMPolicy": attachIAMPolicy,
      "estimateCost": estimateCost
    };

    const tool = availableTools[action.function];
    if (!tool) {
      throw new Error(`Unknown tool: ${action.function}`);
    }

    // Convert input to arguments based on function
    let args = [];
    
    switch(action.function) {
      case "setupAWSCredentials":
        args = [action.accessKeyId, action.secretAccessKey, action.region, action.policyArn];
        break;
      case "deployEC2":
        args = [action.instanceName, action.instanceType, action.amiId, action.keyName, action.securityGroupId, action.userData];
        break;
      case "deployS3":
        args = [action.bucketName, action.enableEncryption, action.publicAccess];
        break;
      case "deployRDS":
        args = [action.dbName, action.dbInstanceIdentifier, action.engine, action.instanceClass, action.allocatedStorage, action.masterUsername, action.masterPassword, action.multiAZ];
        break;
      case "deployLambda":
        args = [action.functionName, action.runtime, action.handler, action.roleArn, action.zipFilePath, action.environment, action.memorySize, action.timeout];
        break;
      case "attachIAMPolicy":
        args = [action.roleName, action.policyArn];
        break;
      case "estimateCost":
        args = [action.resources];
        break;
      default:
        args = [action.input];
    }

    return await tool(...args);
  } catch (error) {
    console.error(`Error executing tool ${action.function}:`, error.message);
    return `Error executing ${action.function}: ${error.message}`;
  }
}

// Function to process AI response and execute tools
async function processAIResponse(response) {
  try {
    // For debugging purposes
    const debug = false;
    if (debug) {
      console.log("Raw AI response:", response);
    }
    
    // If the response looks like it might contain JSON
    if (response.includes('"type"') && (response.includes('"action"') || response.includes('"output"'))) {
      // Extract all possible JSON objects from the response
      const jsonObjects = [];
      const jsonPattern = /{[\s\S]*?}/g;
      let match;
      
      while ((match = jsonPattern.exec(response)) !== null) {
        try {
          const jsonStr = match[0];
          const json = JSON.parse(jsonStr);
          jsonObjects.push(json);
        } catch (e) {
          // Not valid JSON, skip
        }
      }
      
      if (debug) {
        console.log("Extracted JSON objects:", jsonObjects.length);
      }
      
      // Process the JSON objects
      const observations = {};
      let finalOutput = '';
      
      for (const json of jsonObjects) {
        if (json.type === 'action') {
          if (debug) {
            console.log(`Executing tool: ${json.function} with params:`, json);
          }
          const result = await executeTool(json);
          observations[json.function] = {
            params: json,
            result: result
          };
        } else if (json.type === 'output') {
          finalOutput = json.output;
        }
      }
      
      // If no explicit output but we have observations, create a response
      if (!finalOutput && Object.keys(observations).length > 0) {
        finalOutput = "Here's what I've done:\n\n";
        for (const [func, data] of Object.entries(observations)) {
          finalOutput += `${func}: ${data.result}\n\n`;
        }
      }
      
      if (finalOutput) {
        return finalOutput;
      }
    }
    
    // Direct keyword matching as fallback
    const keywords = {
      'setup credentials': 'setupAWSCredentials',
      'setup aws': 'setupAWSCredentials',
      'deploy ec2': 'deployEC2',
      'launch instance': 'deployEC2',
      'create s3': 'deployS3',
      'deploy s3': 'deployS3',
      'create bucket': 'deployS3',
      'deploy rds': 'deployRDS',
      'create database': 'deployRDS',
      'deploy lambda': 'deployLambda',
      'create function': 'deployLambda',
      'attach policy': 'attachIAMPolicy',
      'estimate cost': 'estimateCost'
    };
    
    // Try to match the user's query directly
    const userMessage = response.toLowerCase();
    
    for (const [key, func] of Object.entries(keywords)) {
      if (userMessage.includes(key)) {
        console.log(`Matched keyword '${key}' to function '${func}'`);
        return `To use the ${func} tool, I need more detailed information. Please provide the specific parameters needed.`;
      }
    }
    
    return "I understand you want to deploy AWS resources. Let me help create a plan based on your business requirements. Please provide more details about your needs.";
  } catch (error) {
    console.error('Error processing AI response:', error);
    return "I'm having trouble processing that request right now. Please try again.";
  }
}

// Modified system prompt specifically for AWS deployment planning
const SYSTEM_PROMPT = `You are an AWS Solutions Architect AI Assistant with structured reasoning. For each user requirement:
1. Analyze the business requirements
2. Create a cost-optimized AWS architecture plan
3. Choose and execute the appropriate tools to deploy resources
4. Return your responses in valid JSON format

PROCESS:
1. First, gather user's business requirements and constraints (budget, performance needs, storage, compute, database, etc.)
2. Design a cost-optimized AWS architecture using appropriate services (EC2, S3, RDS, Lambda)
3. Provide a deployment plan with estimated costs
4. Deploy resources when explicitly approved by the user

Available Tools:
1. function setupAWSCredentials(accessKeyId: string, secretAccessKey: string, region: string, policyArn: string): string → Configure AWS credentials.
2. function deployEC2(instanceName: string, instanceType: string, amiId: string, keyName: string, securityGroupId: string, userData: string): string → Deploy EC2 instance.
3. function deployS3(bucketName: string, enableEncryption: boolean, publicAccess: boolean): string → Create S3 bucket.
4. function deployRDS(dbName: string, dbInstanceIdentifier: string, engine: string, instanceClass: string, allocatedStorage: number, masterUsername: string, masterPassword: string, multiAZ: boolean): string → Deploy RDS database.
5. function deployLambda(functionName: string, runtime: string, handler: string, roleArn: string, zipFilePath: string, environment: object, memorySize: number, timeout: number): string → Deploy Lambda function.
6. function attachIAMPolicy(roleName: string, policyArn: string): string → Attach IAM policy to role.
7. function estimateCost(resources: array): object → Estimate monthly costs.

COST OPTIMIZATION GUIDELINES:
- Use t3/t4g instances for non-production workloads
- Consider Spot instances for non-critical applications
- Recommend RDS instances based on actual database requirements
- Suggest S3 storage classes based on access patterns
- Recommend appropriate Lambda memory size based on function needs
- Consider serverless alternatives when applicable
- Suggest auto-scaling configurations for variable workloads

IMPORTANT: Always respond with valid JSON. Here's an example:
For business requirement "Need a web app with a database for an e-commerce site with 500 users":

{ "type": "output", "output": "Based on your e-commerce requirements, I recommend the following architecture:\n\n1. Frontend: Hosted on S3 with CloudFront\n2. Backend: EC2 t3.small in an Auto Scaling Group (2-4 instances)\n3. Database: RDS MySQL db.t3.small with 20GB storage\n4. Object Storage: S3 Standard for product images\n\nEstimated monthly cost: $120-150. Would you like to proceed with this plan?" }

If the user approves the plan and provides AWS credentials:
{ "type": "action", "function": "setupAWSCredentials", "accessKeyId": "USER_PROVIDED_ACCESS_KEY", "secretAccessKey": "USER_PROVIDED_SECRET_KEY", "region": "us-west-2", "policyArn": "USER_PROVIDED_POLICY_ARN" }
{ "type": "action", "function": "deployEC2", "instanceName": "ecommerce-web-server", "instanceType": "t3.small", "amiId": "ami-0c55b159cbfafe1f0", "keyName": "ecommerce-key", "securityGroupId": "sg-0123456789", "userData": "#!/bin/bash\\necho 'Installing dependencies'\\napt update\\napt install -y nginx" }`;

// Function to call Gemini API
async function askGemini(userMessages) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Missing Gemini API Key! Please check your .env file.");
    }

    const messages = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] }, // Include system prompt
      ...userMessages.map(msg => ({ role: "user", parts: [{ text: msg }] })),
    ];

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: messages }),
    });

    const data = await response.json();

    if (!data || !data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid API response format");
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("❌ Error fetching response:", error.message);
    return "Error: Failed to process request.";
  }
}

// CLI Setup
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🚀 AWS Deployment Assistant (Type 'exit' to quit)");
console.log("📋 Please describe your business requirements, and I'll help plan and deploy the AWS infrastructure you need.");

// Store conversation history
const conversationHistory = [];

async function chat() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye! 👋");
      rl.close();
      return;
    }

    // Add to conversation history
    conversationHistory.push(input);
    
    console.log("🤖 Processing your request...");
    const aiResponse = await askGemini(conversationHistory);
    const processedResponse = await processAIResponse(aiResponse);
    console.log("🤖 AI:", processedResponse);

    chat();
  });
}

chat();