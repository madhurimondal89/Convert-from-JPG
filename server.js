const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const archiver = require('archiver');
const path = require('path');

const app = express();
const port = 3000;

const storage = multer.memoryStorage();
// Multer now needs to handle both file and text fields (targetFormat)
const upload = multer({ storage: storage });

app.use(express.static('public'));

// Helper function to perform conversion based on format
async function convertImage(buffer, format) {
    let sharpInstance = sharp(buffer);
    switch (format) {
        case 'png':
            return sharpInstance.png().toBuffer();
        case 'webp':
            return sharpInstance.webp({ quality: 80 }).toBuffer();
        case 'gif':
            return sharpInstance.gif().toBuffer();
        case 'tiff':
            return sharpInstance.tiff({ quality: 80 }).toBuffer();
        default:
            throw new Error('Unsupported format');
    }
}

// Map formats to their content types
const contentTypes = {
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    tiff: 'image/tiff',
};

app.post('/convert-single', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    
    // Get the target format from the request body
    const targetFormat = req.body.format;
    if (!targetFormat || !contentTypes[targetFormat]) {
        return res.status(400).json({ error: 'Invalid target format specified.' });
    }

    try {
        const outputBuffer = await convertImage(req.file.buffer, targetFormat);
        res.set('Content-Type', contentTypes[targetFormat]);
        res.send(outputBuffer);
    } catch (err) {
        console.error(`Failed to convert file:`, err);
        res.status(500).json({ error: 'Failed to convert the image.' });
    }
});

app.post('/convert-and-zip', upload.array('images'), async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).send('No files were uploaded.');

    const targetFormat = req.body.format;
    if (!targetFormat || !contentTypes[targetFormat]) {
        return res.status(400).json({ error: 'Invalid target format specified.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=converted-images.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => res.status(500).send({ error: err.message }));
    archive.pipe(res);

    for (const file of req.files) {
        try {
            const originalName = path.parse(file.originalname).name;
            const outputFileName = `${originalName}.${targetFormat}`;
            const outputBuffer = await convertImage(file.buffer, targetFormat);
            archive.append(outputBuffer, { name: outputFileName });
        } catch (err) {
            console.error(`Failed to convert ${file.originalname}:`, err);
        }
    }

    await archive.finalize();
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});