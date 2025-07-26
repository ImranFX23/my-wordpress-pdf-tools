const fetch = require('node-fetch');
const Busboy = require('busboy');
const FormData = require('form-data');
const dns = require('dns'); // DNS মডিউল যোগ করা হয়েছে

// IPv4 ব্যবহার করতে বাধ্য করার জন্য একটি ট্রিক
dns.setDefaultResultOrder('ipv4first');

const APDF_API_KEY = process.env.APDF_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const APDF_API_URL = 'https://api.apdf.io/v1/pdf';

function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
        });
        const result = { files: [], fields: {} };
        busboy.on('file', (fieldname, file, { filename }) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                result.files.push({ buffer: Buffer.concat(chunks), filename });
            });
        });
        busboy.on('field', (fieldname, val) => { result.fields[fieldname] = val; });
        busboy.on('finish', () => resolve(result));
        busboy.on('error', err => reject(err));
        busboy.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'binary'));
    });
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    try {
        console.log("Function invoked. Parsing form data...");
        const { files, fields } = await parseMultipartForm(event);
        const tool = fields.tool;
        console.log(`Tool identified: ${tool}. Number of files: ${files.length}`);

        if (!tool || files.length === 0) {
          throw new Error("Tool or files are missing from the request.");
        }

        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file.buffer, { filename: file.filename });
        });

        if (fields.options) {
            formData.append('options', fields.options);
        }
        
        const targetUrl = `${APDF_API_URL}/${tool}/`;
        console.log(`Preparing to send request to: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APDF_API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData,
            timeout: 30000 // ৩০ সেকেন্ড টাইমআউট
        });
        
        console.log(`Received response from API. Status: ${response.status}`);
        const result = await response.json();
        
        if (!response.ok) {
            console.error("API Error Response:", result);
            throw new Error(result.message || 'aPDF.io API থেকে একটি ত্রুটি পাওয়া গেছে');
        }

        console.log("Successfully processed. Returning file URL.");
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ fileUrl: result.fileUrl }),
        };

    } catch (error) {
        console.error('SERVER-SIDE CRASH:', error); // সার্ভারের মূল এরর লগ
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Server-side error: ${error.message}` }),
        };
    }
};
