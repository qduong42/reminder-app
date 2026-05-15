export function passwordResetEmail({ resetUrl }: { resetUrl: string }): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #2c3e50;
          }
          a {
            color: #3498db;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .button:hover {
            background-color: #2980b9;
          }
          .expiry {
            font-size: 12px;
            color: #666;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Reset your password</h1>
          <p>Click the button below to reset your password:</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p>Or copy and paste this link in your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <div class="expiry">
            <p>This link expires in 1 hour.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
