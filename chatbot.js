const express = require('express');
const { createClient } = require("@supabase/supabase-js");
const { WebhookClient, Suggestion } = require("dialogflow-fulfillment");
const { Configuration, OpenAI } = require("openai");
require('dotenv').config();
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const tableName = "chat_data"; 

async function addDataToTable(question, answer, intent, useChatGPT) {
  try {
    // Data to be inserted into the table
    const dataToInsert = [
      {
        question: question,
        answer: answer,
        intent: intent,
        use_chatgpt: useChatGPT,
      },
    ];

    // Insert data into the table
    const { data, error } = await supabase.from(tableName).insert(dataToInsert);

    if (error) {
      throw error;
    }

    console.log("Data inserted successfully");
  } catch (error) {
    console.error("Error adding data to the table:", error.message);
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let prompt = `The following is a conversation with an AI advisor specializing in restaurant services and order assistance.If you are ask about location and place then say that it is on Bahdurabad near Saylani, Karachi, Pakistan (Postal Code: 75300). If it says any food name or etc then replied that we don't offer these foods. The advisor is helpful, empathic, polite, and friendly, incorporating humor as appropriate. Our resturant name is ByteBite and owner is Ahmed Mujtaba and cofounder is Khalil Attari. Its objective is to enhance the dining experience and ensure users feel heard. With each response, the AI advisor encourages users to continue the conversation naturally. Avoid asking unrelated questions, answering a question with a question, or discussing sensitive topics like religions, politics, or racial issues. Refrain from commenting on questions, asking for personal details, engaging in sales pitches, or providing phone numbers. Respond in the same language as the question.
AI: Hello, I am your personal AI restaurant assistant. How may I assist you with your dining experience today?
Human:
`;

const textGeneration = async (query) => {

  try {
    const response = await openai.completions.create({
      model: 'text-davinci-003',
      prompt: `${prompt} ${query}\nAI: `,
      temperature: 0.9,
      max_tokens: 500,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0.6,
      stop: ['Human:', 'AI:']
    });

    // console.log('OpenAI API Response:', response.choices[0].text);

    return {
      status: 1,
      response: `${response.choices[0].text}`
    };
  } catch (error) {
    console.log(error)
    return {
      status: 0,
      response: ''
    };
  }
};

const webApp = express();

const PORT = process.env.PORT || 5000;

webApp.use(express.urlencoded({ extended: true }));
webApp.use(express.json());
webApp.use((req, res, next) => {
  console.log(`Path ${req.path} with Method ${req.method}`);
  next();
});


webApp.get('/', (req, res) => {
  res.sendStatus(200);
});


webApp.post('/chatbot_implement', async (req, res) => {
  var id = res.req.body.session.substr(43);
  console.log(id);
  const agent = new WebhookClient({ request: req, response: res });
  let action = req.body.queryResult.action;
  let queryText = req.body.queryResult.queryText;
  let intent = null
  
  async function fallback_intent(agent){
    let useChatGPT = true
    console.log("intent => fallback")
    intent = "fallback"
    let result = await textGeneration(queryText);
    addDataToTable(queryText, result.response, intent, useChatGPT)
    if (result.status == 1) {
      agent.add(result.response);
    } 

  }
  function ordering(agent){
    let useChatGPT = false
    console.log("intent => ordering")
    intent = "ordering"
    const { person, phone, address, details } = agent.parameters;
    const answer = `Hello ${person.name}, thank you for placing an order with us! Your order details are ${details} Your order will be delivered to ${address}. We have noted your phone number as ${phone}. We appreciate your order and look forward to serving you. Thank you!`
    agent.add(`Hello ${person.name}, thank you for placing an order with us! Your order details are ${details} Your order will be delivered to ${address}. We have noted your phone number as ${phone}. We appreciate your order and look forward to serving you. Thank you!`);
    addDataToTable("I want to order", answer, intent, useChatGPT)
    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      }
    });

    var mailOptions = {
      
      from: process.env.GMAIL_EMAIL,
      to: 'bytebite_order@proton.me',
      subject: 'Congratulations, We got another entry for the order from your website',
      text:  `Hello Ahmed Mujtaba (Founder), The details are \n Name : ${person.name} \n Phone : ${phone} \n Address: ${address} \n Details : ${details}`
    };

    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    })
  }

  function welcome_intent(agent){
    agent.add('Hi, I am your virtual ByteBite personal AI assistant. How are you doing today?')
    
  }

  let intentMap = new Map();
  intentMap.set("ordering", ordering);
  // intentMap.set("welcome_intent", welcome_intent);
  intentMap.set("Default Fallback Intent", fallback_intent);
  agent.handleRequest(intentMap);
});


webApp.listen(PORT, () => {
  console.log(`Server is up and running at ${PORT}`);
});
