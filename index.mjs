import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: `.env.local` })

const app = express();

app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PrintAPic Backend</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #ffd1dc 0%, #cfe7ff 100%);
                background-size: 250% 250%;
                animation: gradientAnimation 12s ease infinite;
                min-height: 100svh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                line-height: 1.6;
            }
            
            .container {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 40px 30px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                max-width: 500px;
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.2);
                animation: fadeIn 0.9s ease-in-out;
            }
            
            .message {
                font-family: 'Poppins', sans-serif;
                font-size: 28px;
                font-weight: 600;
                color: #2d3748;
                margin-bottom: 20px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }
            
            .env-value {
                font-size: 24px;
                color: #4a5568;
                background: rgba(102, 126, 234, 0.1);
                padding: 15px 20px;
                border-radius: 12px;
                border-left: 4px solid #667eea;
                margin-top: 20px;
                word-break: break-word;
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }
            .env-value:hover {
                transform: scale(1.03);
                box-shadow: 0 6px 12px rgba(0,0,0,0.12);
            }
            
            .footer {
                margin-top: 30px;
                font-size: 16px;
                color: #718096;
                opacity: 0.8;
            }
            
            .status-indicator {
                display: inline-block;
                width: 12px;
                height: 12px;
                background: #ff6b81;
                border-radius: 50%;
                margin-right: 8px;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }

            @keyframes gradientAnimation {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }

            @keyframes fadeIn {
                0% { opacity: 0; transform: translateY(20px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            
            /* Mobile optimizations */
            @media (max-width: 480px) {
                .container {
                    padding: 30px 20px;
                    margin: 10px;
                }
                
                .message {
                    font-size: 24px;
                }
                
                .env-value {
                    font-size: 20px;
                    padding: 12px 16px;
                }
                
                .footer {
                    font-size: 14px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="message">
                <span class="status-indicator"></span>
                PrintAPic Backend
            </div>
            <div class="env-value">
                ${process.env.FOO || 'Environment variable not set'}
            </div>
            <div class="footer">
                Server is running and ready to serve requests
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
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
