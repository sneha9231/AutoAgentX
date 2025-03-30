# SQL Agent - AI-Powered SQL Assistant

## Overview
SQL Agent is a **Desktop Application** built with **React** and **Electron**. It captures the screen, extracts text using **OCR**, and processes SQL-related queries using **LLM Llama 3.3 7B Versatile Model**. The assistant generates SQL queries from natural language inputs and provides **accurate solutions with visual reports**.

## Features
- **Screen Capture & OCR**: Extracts SQL-related queries from the screen.
- **Natural Language to SQL**: Converts user queries into SQL commands.
- **AI-Powered Assistance**: Uses **Llama 3.3 7B** to generate responses.
- **Data Visualization**: Generates charts and reports with **Chart.js**.
- **Desktop Application**: Built with **React and Electron** for a smooth user experience.
- **Google Calendar Integration** (Additional Feature): Can schedule meetings based on user availability.

## Problem Statement
The application solves the problem of **Auto-Generating SQL Queries Using Natural Language**. It enables users to interact with databases using plain text queries, eliminating the need for SQL knowledge. The tool automates query generation and result visualization, making data retrieval easier and faster.

## Technologies Used
- **Frontend**: React, Electron
- **OCR**: Tesseract.js
- **AI Model**: Llama 3.3 7B Versatile Model
- **Visualization**: Chart.js
- **Google Calendar API** (for scheduling meetings)

## How It Works
1. **Capture the Screen**: The app captures the screen and extracts SQL-related text.
2. **Process the Query**: The extracted text is passed to the **LLM model**, which generates the SQL command.
3. **Execute & Visualize**: The generated SQL is executed, and results are displayed in **text or chart format**.

## Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/sneha9231/SQL_Agent
   cd sql-agent
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the application:
   ```sh
   npm start
   ```
4. Start electron application in different environment
    ```sh
    npm run electron
    ```

## Usage
- Open the application and capture an SQL-related query on the screen.
- The assistant will analyze the query and generate the corresponding SQL or any other work.
- Results will be displayed along with **charts or tabular data**.

## Future Enhancements
- Support for more database integrations.
- Improved OCR accuracy.
- Enhanced scheduling features.
- Send email by prompt

## Some Pictures
1. <img src="photos/1.png" width="300">
2. <img src="photos/2.png" width="300">
3. <img src="photos/3.png" width="300">
4. <img src="photos/4.png" width="300">
5. <img src="photos/5.png" width="400">
6. <img src="photos/6.png" width="400">
