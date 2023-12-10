const fs = require('fs')
const pdf = require('pdf-parse')
const {fromPath} = require('pdf2pic')
const {createWorker} = require('tesseract.js')

const dotenv = require('dotenv')
dotenv.config()

//Function to convert PDF pages to images
async function convertPageToImage(pdfPath, pageNumber, outputPath) {
  const options = {
    density: 400,
    saveFilename: `page${pageNumber}`,
    savePath: outputPath,
    format: 'png',
    width: 1920,
    height: 1080
  };

  const convert = fromPath(pdfPath, options);
  return await convert(pageNumber);
}

// Function to extract text from an image using Tesseract
async function extractTextFromImage(imagePath) {
  const worker = await createWorker();
  const { data: { text } } = await worker.recognize(imagePath);
  await worker.terminate();
  return text;
}

//Function to parse the PDF and extract text
async function parsePdf(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);
  const pagesData = [];

  for (let i = 0; i < data.numpages; i++) {
    const pageNumber = i + 1;

    const imageInfo = await convertPageToImage(pdfPath, pageNumber, './output');
    const ocrText = await extractTextFromImage(imageInfo.path);


    pagesData.push({ page: pageNumber, text: 'textContent', ocr: ocrText })
  }

  return pagesData;
}


//openai
const OpenAI = require("openai");
let totalTokensUsed = 0

const openai_key = process.env.OPENAI_API_KEY
const openai = new OpenAI({ apiKey: openai_key })

async function chatgpt(text, instructions) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: text },
      { role: 'system', content: instructions },
    ],
    temperature: 0.3,
  })
  
  totalTokensUsed += response.usage.total_tokens
  return response.choices[0].message.content
}

async function processPdfAndGenerateOutput(pdfPath, outputTxtPath) {
  try {
    const pagesData = await parsePdf(pdfPath);

    let x = 0
    for (const page of pagesData) {
      const gptResponse = await chatgpt(page.ocr, 'Create flashcards from this text. Complete informations if missing and correct anything that seems to be wrong or incomplete. Add more information if you think it is not enough to make a clear context. The output has to be in a very specific way: first the front (should be a question whenever possible and specific enough to not be confused), then a tab, then the back (when possible always enumerate the options or the list for each item and add a "backslash n" instead of going to new line) like so: "to further  1. help progress or development of (something)\n 2. promote\n3. favor". no other output is allowed. If no opportune output is possible it is allowed to write "no output".');
      await fs.promises.appendFile(outputTxtPath, gptResponse + '\n');
      x++
      console.log(`${x} out of ${pagesData.length}`);
    }

    console.log(`Yay, spent ${totalTokensUsed} tokens`);
  } catch (error) {
    console.error('Error processing PDF:', error.message);
  }
}

processPdfAndGenerateOutput('./DTMI.pdf', './DTMI.txt')