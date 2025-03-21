import readline from "readline";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2";
import { S3Client, CreateBucketCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";
import { RDSClient, CreateDBInstanceCommand } from "@aws-sdk/client-rds";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// AWS Clients
const ec2Client = new EC2Client({ region: process.env.AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const rdsClient = new RDSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// AWS Deployment Functions
async function deployEC2(params) {
  try {
    const command = new RunInstancesCommand({
      ImageId: params.imageId || 'ami-0abcdef1234567890',
      InstanceType: params.instanceType || 't2.micro',
      MinCount: params.minCount || 1,
      MaxCount: params.maxCount || 1,
      KeyName: params.keyName,
      SecurityGroupIds: params.securityGroupIds,
      TagSpecifications: [{
        ResourceType: "instance",
        Tags: [{
          Key: "Name",
          Value: params.instanceName || "AI-Deployed-Instance"
        }]
      }]
    });

    const result = await ec2Client.send(command);
    return {
      success: true,
      instanceId: result.Instances[0].InstanceId,
      message: `EC2 instance ${params.instanceName || 'unnamed'} deployed successfully`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function deployS3(params) {
  try {
    const createBucketCommand = new CreateBucketCommand({
      Bucket: params.bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: params.region || 'us-east-1'
      }
    });

    await s3Client.send(createBucketCommand);
    
    // Set bucket policy if provided
    if (params.bucketPolicy) {
      const putPolicyCommand = new PutBucketPolicyCommand({
        Bucket: params.bucketName,
        Policy: JSON.stringify(params.bucketPolicy)
      });
      await s3Client.send(putPolicyCommand);
    }

    return {
      success: true,
      bucketName: params.bucketName,
      message: `S3 bucket ${params.bucketName} created successfully`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function deployRDS(params) {
  try {
    const command = new CreateDBInstanceCommand({
      DBInstanceIdentifier: params.dbIdentifier,
      DBInstanceClass: params.instanceClass || 'db.t3.micro',
      Engine: params.engine || 'mysql',
      AllocatedStorage: params.storage || 20,
      MasterUsername: params.masterUsername,
      MasterUserPassword: params.masterPassword,
      VpcSecurityGroupIds: params.securityGroupIds,
      DBSubnetGroupName: params.subnetGroupName,
      BackupRetentionPeriod: params.backupRetention || 7,
      MultiAZ: params.multiAZ || false
    });

    const result = await rdsClient.send(command);
    return {
      success: true,
      dbIdentifier: result.DBInstance.DBInstanceIdentifier,
      message: `RDS instance ${params.dbIdentifier} deployed successfully`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to execute tool based on AI response
async function executeTool(action) {
  try {
    const availableTools = {
      deployEC2,
      deployS3,
      deployRDS
    };

    const tool = availableTools[action.function];
    if (!tool) {
      throw new Error(`Unknown tool: ${action.function}`);
    }

    return await tool(action.params);
  } catch (error) {
    console.error(`Error executing tool ${action.function}:`, error.message);
    return {
      success: false,
      error: `Error executing ${action.function}`
    };
  }
}

// Function to process AI response and execute tools
async function processAIResponse(response) {
  try {
    const lines = response.split('\n');
    let output = '';
    const observations = {};

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);
        
        if (json.type === 'action') {
          const result = await executeTool(json);
          observations[json.function] = result;
        } else if (json.type === 'output') {
          output = json.output;
        }
      } catch (e) {
        continue;
      }
    }

    if (!output && Object.keys(observations).length > 0) {
      output = "Deployment Results:\n\n";
      for (const [functionName, result] of Object.entries(observations)) {
        output += `${functionName}: ${result.message}\n`;
      }
    }

    return output || response;
  } catch (error) {
    console.error('Error processing AI response:', error);
    return "Error processing deployment request.";
  }
}

// System prompt for AWS deployment planning
const SYSTEM_PROMPT = `You are an AWS Deployment AI Assistant that helps users deploy cost-optimized AWS resources. Follow these steps:

1. First, analyze the user's business requirements
2. Create a detailed deployment plan considering:
   - Cost optimization
   - Security best practices
   - Scalability requirements
   - High availability needs
3. Choose appropriate AWS services (EC2, S3, RDS, Lambda)
4. Generate deployment actions in JSON format

Available Tools:
1. function deployEC2(params: object): object → Deploys EC2 instance
   Parameters:
   - imageId: string (AMI ID)
   - instanceType: string (e.g., t2.micro)
   - keyName: string (SSH key name)
   - securityGroupIds: string[]
   - instanceName: string

2. function deployS3(params: object): object → Creates S3 bucket
   Parameters:
   - bucketName: string
   - region: string
   - bucketPolicy: object (optional)

3. function deployRDS(params: object): object → Deploys RDS instance
   Parameters:
   - dbIdentifier: string
   - instanceClass: string
   - engine: string
   - masterUsername: string
   - masterPassword: string
   - securityGroupIds: string[]
   - subnetGroupName: string

Example Response Format:
{ "type": "plan", "plan": "Based on requirements, we'll deploy: 1. EC2 instance for web server 2. S3 bucket for static content" }
{ "type": "action", "function": "deployEC2", "params": { "instanceType": "t2.micro", "keyName": "my-key", "securityGroupIds": ["sg-123"] } }
{ "type": "action", "function": "deployS3", "params": { "bucketName": "my-static-content", "region": "us-east-1" } }
{ "type": "output", "output": "Deployment completed successfully. Created EC2 instance i-123 and S3 bucket my-static-content" }`;

// Function to call Gemini API
async function askGemini(userMessages) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Missing Gemini API Key! Please check your .env file.");
    }

    const messages = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
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

console.log("🤖 AWS Deployment AI Assistant (Type 'exit' to quit)");
console.log("Please provide your AWS credentials and business requirements:");

async function chat() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye! 👋");
      rl.close();
      return;
    }

    console.log("🤖 Analyzing requirements and creating deployment plan...");
    const aiResponse = await askGemini([input]);
    const processedResponse = await processAIResponse(aiResponse);
    console.log("🤖 AI:", processedResponse);

    chat();
  });
}

chat();
