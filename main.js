const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

const aws = require('aws-sdk');
const multer = require('multer');

app.use(bodyParser.json());
app.use(cors());
const pool = require('./db'); 
let awsAcessObj = {
   accessKeyId: 'AKIAUPCKTHUGWACQ2HXD',   
  secretAccessKey: '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',
  region: 'us-east-2',             
}
const bucket_name = 'smalempabucket'
const lamdaFunName = 'smalempa'
aws.config.update(awsAcessObj);
const impl = require('./impl')

const upload = multer();
function delete_file_if_file_exceeds(url){
        const s3 = new aws.S3();
        const filePathUrl = url;
        const urlParts = filePathUrl.split('/');
        let objectKey = urlParts[urlParts.length -1];
       objectKey = objectKey.replace('%20', ' ')
       const headParams = {
          Bucket: bucket_name,
          Key: objectKey,
        };
        s3.getObject(headParams, (err, data) => {
          if (err) {
            if (err.code === 'NoSuchKey') {
              console.log('File does not exist.');
            } else {  
              console.error('Error checking file existence:', err);
            }
          } else {
            console.log('File exists. Proceeding with deletion...');
            
            // Define the parameters for the delete operation
            const deleteParams = {
              Bucket: lamdaFunName,
              Key: objectKey,
            };

            // Call the deleteObject method to delete the file
            s3.deleteObject(deleteParams, (deleteErr, deleteData) => {
              if (deleteErr) {
                console.error('Error deleting file:', deleteErr);
              } else {
                 console.log('File deleted successfully:', deleteData);
              }
            });
          }
        });
}

const updateClick = async (id, url) => {
  const selectSql = 'SELECT emails, id, clicks FROM file_clicks WHERE id = ?';

  try {
    const [rows] = await pool.query(selectSql, [id]);
    if (rows.length === 0) {
      console.log('No data found for the given ID.');
      return false;
    }

    const row = rows[0];
    const emailCount = row.emails.split(',').length;
    if((emailCount -1 )== row.clicks){
      delete_file_if_file_exceeds(url)
    }
    console.log('hghg')
    if (emailCount > row.clicks) {
      const updateSql = 'UPDATE file_clicks SET clicks = clicks + 1 WHERE id = ?';
      await pool.query(updateSql, [id]);
      console.log('Click updated successfully.');
      return true;
    }else {
      
      console.log('Cannot update click. Click limit reached.');
      return false;
    }
    
  } catch (error) {
    console.error('Error while updating click:', error);
    return false;
  }
};



app.post('/api/upload', upload.single('file') , async (req, res) => {
  let result =   await impl.upload(req, res)
  return result
});





app.post('/api/send/subscriptions', async (req, res) => {
  const emails = req.body;
 return await impl.subscriptions(emails, res)
});

app.post('/api/countClicks', async (req, res) => {
  try {
    const { userId, url } = req.body;

    const updateSuccessful = await updateClick(userId, url);

    res.status(200).json({ status: 200, data: updateSuccessful });
  } catch (err) {
    res.status(500).json({ status: 500, data: err.message });
  }
});


const PORT = 4600; 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
