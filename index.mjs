import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: `.env.local` })

const app = express();

app.get('/', (req, res) => {
    res.send(`This is a friendly little message: ${process.env.FOO}`);
});

app.get('/time', (req, res) => {
    const currentTime = new Date().toISOString();
    res.json({
        time: currentTime,
        message: `Current server time is: ${currentTime}`
    });
});

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
