/*

This script monitors "distributorAddress" and if its balance bigger or equal "distributorTrashold", it looks to "poolAddress" outgoing transactions,
sums them and gets rate, then sends multiout for all recipiants.
TODO: blacklist and if more then 64 recipients
Written for pir8radio

Author shefas

*/

const { composeApi, ApiSettings } = require("@burstjs/core");
const axios = require("axios");

const NODE = "http://127.0.0.1:6876"; //if using testnet set to "http://127.0.0.1:6876", realnet "http://127.0.0.1:8125", remote testnet node http://nivbox.co.uk:6876

const apiSettings = new ApiSettings(NODE, "burst");
const api = composeApi(apiSettings);

const {
    generateMasterKeys,
    getAccountIdFromPublicKey
  } = require("@burstjs/crypto");

const ONE_BURST = 100000000; 

const poolAddress = "TS-QURT-QQY8-ER3L-3E44Y"; //POOL.SIGNUMCOIN.RO -> S-GG4B-34Y9-ZXGV-FNTNJ, testnet pool TS-QURT-QQY8-ER3L-3E44Y
const ignoredAddress = "S-"; // TODO We need to ignore miner which donates all his earnings

const distributorAddress = 'TS-MJ9F-XSTZ-V4UB-CBZM7';
const distributorTrashold = 10 * ONE_BURST;
const distributorPassphrase = "testSignum"; // testnet "pirmas"

const oneMonth = 60 * 60 * 24 * 31; //seconds in one month, 2678400 

const FEE = 2205000; //735000,  1470000,  2205000,  2940000,  3675000,  4410000


//If account more then x, it distributes
async function getAccountBalance() {
    try{
    let balance = await api.account.getAccountBalance(distributorAddress);
    let balanceINT = parseInt(balance.balanceNQT);
    if (balanceINT >= distributorTrashold) getAccountTransactions(balanceINT);
    console.log(balanceINT);
    }  catch (e) {
        //e is of type HttpError (as part of @burstjs/http)
        console.error(`Whooops, something went wrong: ${e.message}`);
      }
}

//we get all transactions from pool
async function getAccountTransactions(balance) {
    let argument = {accountId: poolAddress, type: 0, subtype: 1}; //later add here timestamp, after oliver update BurstJS
    let transactions = await api.account.getAccountTransactions(argument);
    let timeNow = await api.network.getTime();
    let filterByTimestamp = transactions.transactions.filter(t => t.timestamp > (timeNow.time - oneMonth));
   
    let takeAttachments = filterByTimestamp.map(t => t.attachment.recipients);


    let collector = [];
    takeAttachments.forEach(e => e.forEach(t => { 
        let index = collector.findIndex(e => e[0] === t[0]);
        if(index == -1){
            collector.push(t); 
        } else {
            collector[index][1] = Number(collector[index][1]) + Number(t[1]);
        }

    }));
    console.log(collector); //Now we have all summed transactions from pool to recipiants

    //Probably not nice way
    let collectorAmount = [];   
    collector.map(e => collectorAmount.push(e[1]));
    collectorAmount = collectorAmount.reduce((t, e) => t + e, 0); 
    console.log("Total amount: " + collectorAmount) //Sum of all amounts
    let rate = Math.floor(collectorAmount / (balance - (2 *FEE))); //JavaScript rounding problems
    console.log("Rate: " + rate);

    let modifiedList = collector.map(e => [e[0], Math.floor(e[1] / rate)]);
    console.log(modifiedList);

    sendMultiOut(modifiedList);
}

// https://burst-apps-team.github.io/phoenix/interfaces/core_api.transactionapi.html#sendamounttomultiplerecipients
//max 64 recipients, { recipient: '8745189287196529307',amountNQT: '32607118'}, { recipient: '14978592240935099976',amountNQT: '194252463'}
async function sendMultiOut(list) {
    let keys = generateMasterKeys(distributorPassphrase);
    
    //we need to check list, maybe it is bigger then 64 recipients
    let covertedList = [];
    list.map(e => covertedList.push( {recipient: e[0], amountNQT: e[1]} ));
    console.log(covertedList);

    try {
    let transactions = await api.transaction.sendAmountToMultipleRecipients(
        covertedList, 
        FEE,
        keys.publicKey,
        keys.signPrivateKey
    ) 
    console.log(transactions); 
    } catch (e) {
        //e is of type HttpError (as part of @burstjs/http)
        console.error(`Whooops, something went wrong: ${e.message}`);
      }
}



//must be more then 4 min, if less there is bug
setInterval(()=>getAccountBalance(), 2 * 4 * 60 * 1000) //miliseconds , 1000 == 1s, blocktime = 4 * 60 * 1000


