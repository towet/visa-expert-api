import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import Cors from 'cors';

// Initialize CORS middleware
const cors = Cors({
  methods: ['GET', 'POST', 'OPTIONS'],
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://visa-expert-payment.netlify.app'], // Allow both possible Vite ports and deployed frontend
  credentials: true,
});

// Helper method to wait for a middleware to execute before continuing
function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

const PESAPAL_URL = 'https://pay.pesapal.com/v3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Run the CORS middleware
  await runMiddleware(req, res, cors);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, orderData } = req.body;

    console.log('Registering IPN with token:', {
      token_length: token?.length,
      callback_url: orderData?.callback_url
    });

    // First register IPN URL
    const ipnResponse = await axios.post(
      `${PESAPAL_URL}/api/URLSetup/RegisterIPN`,
      {
        url: orderData.callback_url,
        ipn_notification_type: 'POST',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    console.log('IPN Registration response:', ipnResponse.data);

    const ipnData = ipnResponse.data;
    if (!ipnData.ipn_id) {
      throw new Error('Failed to get IPN ID');
    }

    // Submit order with IPN ID
    const submitResponse = await axios.post(
      `${PESAPAL_URL}/api/Transactions/SubmitOrderRequest`,
      {
        ...orderData,
        notification_id: ipnData.ipn_id,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    console.log('Submit order response:', submitResponse.data);

    return res.status(200).json(submitResponse.data);
  } catch (error: any) {
    console.error('Error submitting order:', {
      error_message: error.message,
      response_data: error.response?.data,
      response_status: error.response?.status
    });
    
    return res.status(error.response?.status || 500).json({
      error: 'Failed to submit order',
      details: error.response?.data || error.message
    });
  }
}
