const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const aws = require("aws-sdk");
const multer = require("multer");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
app.use(bodyParser.json());
let { accessKeyId, secretAccessKey, region } = {
  accessKeyId: "AKIAUPCKTHUGVYWJ57CC",
  secretAccessKey: "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",
  region: "us-east-2",
};
app.use(cors());
const pool = require("./mysql");
aws.config.update({
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey,
  region: region,
});
const sns = new aws.SNS();
const lambda = new aws.Lambda();
const upload = multer();

function onSetStatus(code, data, res){
 
  return res.status(code).json({
    status: code, data: data
  });
}
function onGenerateId() {
  return new Date().getDate().toString(36) + new Date().getTime().toString(36);
}
function file_deletion_exceeds_count(url) {
  const s3 = new aws.S3();

  const file_url_path = url;
  const urlSplit = file_url_path.split("/");
  const bucket_name = urlSplit[2];
  const objectKey = urlSplit[urlSplit.length - 1];

  const header_params = {
    Bucket: "smalempabucket",
    Key: objectKey,
  };

  s3.getObject(header_params, (err, data) => {
    console.log(data, "datatatats");
    if (err) {
      if (err.code === "NoSuchKey") {
        console.log("File does not exist.");
      } else {
        console.error("Error checking file existence:", err);
      }
    } else {
    }
    console.log("File exists. Proceeding with deletion...");

    const deleteParams = {
      Bucket: "smalempabucket",
      Key: objectKey,
    };
    s3.deleteObject(deleteParams, (deleteErr, deleteData) => {
      if (deleteErr) {
        console.error("Error deleting file:", deleteErr);
      } else {
        console.log("File deleted successfully:", deleteData);
      }
    });
  });
}
const onSubscribeEmails = async (topicArn) => {
  try {
    const {
      SNSClient,
      ListSubscriptionsByTopicCommand,
    } = require("@aws-sdk/client-sns");
    const snsClient = new SNSClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    const command = new ListSubscriptionsByTopicCommand({ TopicArn: topicArn });
    const response = await snsClient.send(command);
    const subscribers = response.Subscriptions.map(
      (subscription) => subscription.Endpoint
    );
    console.log("file delete process");
    return subscribers;
  } catch (error) {
    console.error("Error in getting subscribed users list:", error);
    return [];
  }
};
const setUpdateCount = async (id, url) => {
  const selectSql = "SELECT emails, id, count FROM fileclickcount WHERE id = ?";

  try {
    const [rows] = await pool.query(selectSql, [id]);
    if (rows.length === 0) {
      console.log("For the given Id no data is found.");
      return false;
    }

    const row = rows[0];
    const emailCount = row.emails.split(",").length;
    // if(emailCount - 1 > row.count ){

    // }
    console.log(emailCount, row.count);
    if (emailCount > row.count) {
      const updateSql =
        "UPDATE fileclickcount SET count = count + 1 WHERE id = ?";
      await pool.query(updateSql, [id]);
      console.log("The count updated successfully.");
      if (emailCount - 1 == row.count) {
        file_deletion_exceeds_count(url);
      }
      return true;
    } else {
      console.log("The count limit has reached, cannot update the count.");
      return false;
    }
  } catch (error) {
    console.error("While updated count, error is encountered:", error);
    return false;
  }
};

const onPutDataToTable = async (tname, rowData) => {
  let sql = "";
  if (tname == "fileuploaddetails") {
    sql =
      "INSERT INTO fileuploaddetails (emails, filename,fileuploadeddate,fileurl,id) VALUES (?, ?, ?,?,?)";
    pool.query(
      sql,
      [
        rowData.emails,
        rowData.filename,
        rowData.fileuploadeddate,
        rowData.fileurl,
        rowData.id,
      ],
      (err, results) => {
        if (err) {
          return console.error("Encountered error while inserting data:", err);
        } else {
          return console.log("Successfully data got inserted:", results);
        }
      }
    );
  } else if (tname == "fileclickcount") {
    sql =
      "INSERT INTO fileclickcount (emails, fileurl, count, id) VALUES (?, ?, ?,?)";
    pool.query(
      sql,
      [rowData.emails, rowData.fileurl, 0, rowData.id],
      (err, results) => {
        if (err) {
          return console.error("Encountered error while inserting data:", err);
        } else {
          return console.log("Successfully data got inserted:", results);
        }
      }
    );
  }
};

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "no file has been provided" });
    }
    const payload = {
      fileContent: req.file.buffer.toString("base64"),
      fileName: req.file.originalname,
    };
    const lambdaFunData = {
      FunctionName: "smalempa",
      Payload: JSON.stringify(payload),
    };

    const lambdaInfo = await lambda.invoke(lambdaFunData).promise();

    const response = JSON.parse(lambdaInfo.Payload);
    let randomId = onGenerateId();
    const tpArn = "arn:aws:sns:us-east-2:307246611725:smalempatopic";
    const userEmails = await onSubscribeEmails(tpArn);
    const fileUrl = JSON.parse(response.body).fileUrl;
    onPutDataToTable("fileuploaddetails", {
      emails: userEmails.join(","),
      filename: req.file.originalname,
      fileuploadeddate: new Date(),
      fileurl: JSON.parse(response.body).fileUrl,
      id: randomId,
    });
    onPutDataToTable("fileclickcount", {
      emails: userEmails.join(","),
      fileurl: JSON.parse(response.body).fileUrl,
      count: 0,
      id: randomId,
    });
    const snsClient = new SNSClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
    const linkMsg =
      "Please click on the link provided to download your file:" +
      `http://3.145.10.174/fetch/id=${randomId}_url${fileUrl
        .split(".com")[1]
        .replace(/^\/+/, "")}`;
    const snsPublishParams = {
      TopicArn: tpArn,
      Message: linkMsg,
    };
    await snsClient.send(new PublishCommand(snsPublishParams));
    console.log(
      "The file link has been sent to the users successfully who are subscribed."
    );
      onSetStatus(200, "The file has been successfully uploaded to S3", res)
    
  } catch (error) {
    console.error("Upload failed:", error);
     onSetStatus(500, "The file upload has failed", res)
  }
});

const On_email_Request_subscription = async (topicArn, email) => {
  try {
    const params = {
      Protocol: "email",
      TopicArn: topicArn,
      Endpoint: email,
    };

    const data = await sns.subscribe(params).promise();
    return data.ConfirmationUrl;
  } catch (error) {
    console.error("Error has been encountered while subscribing:", error);
    throw error;
  }
};
const OncreateTopic = async (topicName) => {
  try {
    
    const data = await sns.createTopic({
      Name: topicName,
    }).promise();
    return data.TopicArn;
  } catch (error) {
    console.error("Error has been encountered while creating topic:", error);
    throw error;
  }
};

app.post("/api/subscriptions/send", async (req, res) => {
  const emails = req.body;

  try {
    const topicArn = await OncreateTopic("smalempatopic");
    const subscriptionPromises = emails.map(async (email) => {
      const confirmationUrl = await On_email_Request_subscription(topicArn, email);
      return confirmationUrl;
    });

    const confirmationUrls = await Promise.all(subscriptionPromises);
      onSetStatus(200, confirmationUrls, res)
   
  } catch (error) {
    console.error("Error has been encountered in subscription process:", error);
     onSetStatus(500, "Error has been encountered in subscription process", res)
  }
});

app.post("/api/count", async (req, res) => {
  try {
    if (await setUpdateCount(req.body.userId, req.body.url)) {
      onSetStatus(200, true, res)
      
    } else {
       onSetStatus(200, false, res)
    }
  } catch (err) {
     onSetStatus(500, err, res)
   
  }
});

const PORT = 4500;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
