import express from 'express';
import bodyParser from 'body-parser';
import AWS from 'aws-sdk';
import { spawn } from 'child_process';
import axios from 'axios';
import { GeminiAPI } from './gemini-api.js';

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Configure AWS SDK
AWS.config.update({ region: 'us-east-1' });
const ec2 = new AWS.EC2();
const s3 = new AWS.S3();
const rds = new AWS.RDS();

// AI agent to process user requirements
async function processUserInput(userInput) {
    const response = await GeminiAPI.processText(userInput);
    return response;
}

// API endpoint to handle user requests
app.post('/deploy', async (req, res) => {
    const { userMessage } = req.body;
    const aiResponse = await processUserInput(userMessage);
    
    if (aiResponse.includes('EC2')) {
        const params = {
            ImageId: 'ami-0abcdef1234567890',
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1
        };
        
        ec2.runInstances(params, (err, data) => {
            if (err) return res.status(500).send(err);
            res.json({ message: 'EC2 instance deployed', data });
        });
    } else if (aiResponse.includes('S3')) {
        const bucketName = `user-bucket-${Date.now()}`;
        s3.createBucket({ Bucket: bucketName }, (err, data) => {
            if (err) return res.status(500).send(err);
            res.json({ message: `S3 bucket created: ${bucketName}`, data });
        });
    } else if (aiResponse.includes('RDS')) {
        const params = {
            DBInstanceIdentifier: 'user-db-instance',
            DBInstanceClass: 'db.t3.micro',
            Engine: 'mysql',
            AllocatedStorage: 20,
            MasterUsername: 'admin',
            MasterUserPassword: 'password123'
        };
        
        rds.createDBInstance(params, (err, data) => {
            if (err) return res.status(500).send(err);
            res.json({ message: 'RDS instance deployed', data });
        });
    } else {
        res.json({ message: 'No AWS service detected in user request' });
    }
});

// AI Agent API (Gemini AI)
async function getAIResponse(userQuery) {
  const apiKey = "YOUR_GEMINI_API_KEY";
  const response = await axios.post(
    "https://api.gemini.com/v1/chat/completions",
    {
      model: "gemini-pro",
      messages: [{ role: "user", content: userQuery }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.choices[0].message.content;
}

// Route: User interacts with AI
app.post("/ask", async (req, res) => {
  const userMessage = req.body.message;
  
  if (!userMessage) {
    return res.status(400).json({ error: "Message is required" });
  }
  
  try {
    const aiResponse = await getAIResponse(userMessage);
    res.json({ response: aiResponse });
  } catch (error) {
    res.status(500).json({ error: "AI service error", details: error.message });
  }
});

// Route: Trigger AWS Deployment
app.post("/deploy-aws", (req, res) => {
  const { serviceType } = req.body;
  if (!serviceType) {
    return res.status(400).json({ error: "Service type is required" });
  }

  const pythonProcess = spawn("python3", ["deploy_aws.py", serviceType]);
  let output = "";

  pythonProcess.stdout.on("data", (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`Error: ${data}`);
  });

  pythonProcess.on("close", (code) => {
    if (code === 0) {
      res.json({ message: "AWS Deployment Successful", details: output });
    } else {
      res.status(500).json({ error: "AWS Deployment Failed" });
    }
  });
});

app.listen(PORT, () => {
  console.log(`AI Agent is running on port ${PORT}`);
});
