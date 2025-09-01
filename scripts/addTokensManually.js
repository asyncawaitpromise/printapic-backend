import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config({ path: `.env.local` });

/**
 * Manual Token Management Script
 * 
 * This script allows manual addition or removal of tokens from a user account.
 * It simulates the purchase/refund process by creating payment and transaction records.
 * 
 * Usage:
 *   node scripts/addTokensManually.js
 */

const requiredEnv = ['POCKETBASE_URL', 'PB_SUPER_EMAIL', 'PB_SUPER_PASS'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} is not defined in your .env.local file`);
  }
}

const pb = new PocketBase(process.env.POCKETBASE_URL);

const authenticateAdmin = async () => {
  console.log('Authenticating as PocketBase Super Admin…');
  await pb.collection('_superusers').authWithPassword(
    process.env.PB_SUPER_EMAIL,
    process.env.PB_SUPER_PASS,
  );
  console.log('✅ Authenticated.');
};

const createReadlineInterface = () => {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
};

const promptUser = (rl, question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

const validateUserId = async (userId) => {
  try {
    const user = await pb.collection('printapic_users').getOne(userId);
    return user;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};

const addTokensToUser = async (userId, tokenAmount) => {
  const user = await pb.collection('printapic_users').getOne(userId);
  const newTokenBalance = user.tokens + tokenAmount;
  
  if (newTokenBalance < 0) {
    throw new Error(`Cannot remove ${Math.abs(tokenAmount)} tokens. User only has ${user.tokens} tokens.`);
  }
  
  await pb.collection('printapic_users').update(userId, {
    tokens: newTokenBalance
  });
  
  return newTokenBalance;
};

const createPaymentRecord = async (userId, tokenAmount) => {
  const pricePerToken = 0.10; // $0.10 per token
  const amountCents = Math.round(Math.abs(tokenAmount) * pricePerToken * 100);
  const isRemoval = tokenAmount < 0;
  
  const paymentData = {
    user: userId,
    stripe_session_id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    price_id: isRemoval ? 'manual_removal' : 'manual_addition',
    amount_cents: isRemoval ? -amountCents : amountCents,
    tokens: tokenAmount,
    status: 'complete'
  };
  
  const payment = await pb.collection('printapic_payments').create(paymentData);
  return payment;
};

const createTokenTransaction = async (userId, tokenAmount, paymentId) => {
  const isRemoval = tokenAmount < 0;
  const transactionData = {
    user: userId,
    amount: tokenAmount,
    reason: isRemoval ? 'Manual token removal' : 'Manual token addition',
    reference_id: paymentId
  };
  
  const transaction = await pb.collection('printapic_token_transactions').create(transactionData);
  return transaction;
};

const main = async () => {
  const rl = createReadlineInterface();
  
  try {
    await authenticateAdmin();
    
    console.log('\n=== Manual Token Addition ===\n');
    
    // Prompt for user ID
    const userId = await promptUser(rl, 'Enter user ID: ');
    
    if (!userId) {
      console.log('❌ User ID is required.');
      process.exit(1);
    }
    
    // Validate user exists
    const user = await validateUserId(userId);
    if (!user) {
      console.log(`❌ User with ID "${userId}" not found.`);
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.email || user.username || 'Unknown'}`);
    console.log(`   Current token balance: ${user.tokens}`);
    
    // Prompt for token amount
    const tokenInput = await promptUser(rl, 'Enter number of tokens to add (negative to remove): ');
    const tokenAmount = parseInt(tokenInput, 10);
    
    if (isNaN(tokenAmount) || tokenAmount === 0) {
      console.log('❌ Invalid token amount. Must be a non-zero number.');
      process.exit(1);
    }
    
    // Confirm the action
    const pricePerToken = 0.10;
    const totalCost = (Math.abs(tokenAmount) * pricePerToken).toFixed(2);
    const action = tokenAmount > 0 ? 'add' : 'remove';
    const absTokenAmount = Math.abs(tokenAmount);
    console.log(`\nYou are about to ${action} ${absTokenAmount} tokens (simulated ${tokenAmount > 0 ? 'cost' : 'refund'}: $${totalCost})`);
    const confirm = await promptUser(rl, 'Continue? (y/N): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }
    
    console.log(`\n⏳ Processing token ${tokenAmount > 0 ? 'addition' : 'removal'}...`);
    
    // Create payment record
    const payment = await createPaymentRecord(userId, tokenAmount);
    console.log(`✅ Payment record created: ${payment.id}`);
    
    // Add/remove tokens from user
    const newBalance = await addTokensToUser(userId, tokenAmount);
    console.log(`✅ Tokens ${tokenAmount > 0 ? 'added to' : 'removed from'} user. New balance: ${newBalance}`);
    
    // Create transaction record
    const transaction = await createTokenTransaction(userId, tokenAmount, payment.id);
    console.log(`✅ Transaction record created: ${transaction.id}`);
    
    console.log(`\n🎉 Token ${tokenAmount > 0 ? 'addition' : 'removal'} completed successfully!`);
    console.log(`   User: ${user.email || user.username || userId}`);
    console.log(`   Tokens ${tokenAmount > 0 ? 'added' : 'removed'}: ${Math.abs(tokenAmount)}`);
    console.log(`   New balance: ${newBalance}`);
    
  } catch (error) {
    console.error(`\n❌ Token ${tokenAmount > 0 ? 'addition' : 'removal'} failed:`);
    if (error.response && typeof error.response === 'object') {
      console.error('API Error:', error.message);
      console.error(`Status: ${error.status}`);
      if (error.response.data) {
        console.error('Details:', JSON.stringify(error.response.data, null, 2));
      }
    } else {
      console.error('Error:', error.message || error);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
};

main();