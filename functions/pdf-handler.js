const fetch = require('node-fetch');
const Busboy = require('busboy');

const APDF_API_KEY = process.env.APDF_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const APDF_API_URL = 'https://api.apdf.io/v1/pdf';

// Helper to parse multipart form data
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
        });

        const result = {
            files: [],
            fields: {}
        };

        busboy.on('file', (fieldname, file,
            {
                filename,
                encoding,
                mimeType
            }) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                result.files.push({
                    fieldname,
                    buffer: Buffer.concat(chunks),
                    filename,
                    encoding,
                    mimeType
                });
            });
        });

        busboy.on('field', (fieldname, val) => {
            result.fields[fieldname] = val;
        });

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
        return {
            statusCode: 204,
            headers
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { files, fields } = await parseMultipartForm(event);
        const tool = fields.tool;

        if (!tool || files.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tool or files missing.' }) };
        }

        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', new Blob([file.buffer]), file.filename);
        });

        if (fields.options) {
            formData.append('options', fields.options);
        }
        
        const response = await fetch(`${APDF_API_URL}/${tool}/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${APDF_API_KEY}`
            },
            body: formData,
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'API request failed');
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
