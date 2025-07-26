const fetch = require('node-fetch');
const Busboy = require('busboy');
const FormData = require('form-data'); // <-- নতুন টুল ইমপোর্ট করা হয়েছে

const APDF_API_KEY = process.env.APDF_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const APDF_API_URL = 'https://api.apdf.io/v1/pdf';

// এই অংশটি ঠিক আছে, কোনো পরিবর্তন লাগবে না
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
        const { files, fields } = await parseMultipartForm(event);
        const tool = fields.tool;

        // --- মূল পরিবর্তন এখানে ---
        // 'form-data' লাইব্রেরি ব্যবহার করে ফাইল পাঠানোর জন্য প্রস্তুত করা হচ্ছে
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file.buffer, { filename: file.filename });
        });

        if (fields.options) {
            formData.append('options', fields.options);
        }
        
        const response = await fetch(`${APDF_API_URL}/${tool}/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APDF_API_KEY}`,
                ...formData.getHeaders() // form-data লাইব্রেরি নিজে থেকে সঠিক হেডার তৈরি করবে
            },
            body: formData,
        });
        // --- পরিবর্তন শেষ ---

        const result = await response.json();
        
        if (!response.ok) {
            console.error("API Error Response:", result);
            throw new Error(result.message || 'aPDF.io API থেকে একটি ত্রুটি পাওয়া গেছে');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ fileUrl: result.fileUrl }),
        };

    } catch (error) {
        console.error('Serverless function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
