const express = require('express');
const session = require('express-session')
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const config = require('./config/config');
const tokenAbi = require('./config/erc20ABI')
const request = require('request');

// init web3
const Web3 = require('web3');
const web3 = new Web3(config.getConfig().httpEndpoint + '/v1/ETH/rpc');

let app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let token_list = [];
let address;

/*
  Default Route
*/
app.get('/', function(req, res) {
  res.render('index');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res) {
  const address = req.param('address');
  const privateKey = req.param('private_key');
  let globalConfig = config.getConfig();
  globalConfig.privateKey = privateKey;
  globalConfig.address = address;
  res.redirect('/');
});

app.get('/api/get_info', async function(req, res) {
  const address = config.getConfig().address;
  const result = await web3.eth.getBalance(address);
  const ether = web3.utils.fromWei(result, 'ether');
  res.json( { balance: ether, address: address});
});

app.post('/api/transfer', async function(req, res) {
  let fromAddress = config.getConfig().address;
  let privateKey = config.getConfig().privateKey;
  let contractAddress = req.param('contract');
  let toAddress = req.param('to_address');
  let amount = req.param('amount');
  let etherToWei = web3.utils.toWei(amount.toString(), 'ether');

  let rawTx = {};
  let nonce = await web3.eth.getTransactionCount(fromAddress, 'pending');
  // let gasPrice = web3.utils.toHex(web3.utils.toWei('100', 'gwei'));
  const gasPrice = 30000000000;
  const gasLimit = 2000000;

  if (contractAddress) {
    let tokenContract = new web3.eth.Contract(tokenAbi, contractAddress);
    let inputData = tokenContract.methods.transfer(toAddress, amount).encodeABI();

    rawTx = {
      to: contractAddress,
      value: 0,
      gasPrice,
      gas: '200000',
      data: inputData,
      nonce: nonce
    };
  } else {
    rawTx = {
      from: fromAddress,
      to: toAddress,
      value: etherToWei,
      gasPrice,
      gasLimit,
      nonce: nonce
    };
  }

  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.replace('0x', '');
  }

  let account = web3.eth.accounts.privateKeyToAccount(privateKey);
  let signedTx = await account.signTransaction(rawTx);
  let data = {};

  let txInfo = await web3.eth.sendSignedTransaction(signedTx.rawTransaction, (err, txHash) => {
    if (err) {
      data.result = 'fail';
      res.json(data);
      return;
    }
  });
  data.result = 'success';
  data.txInfo = txInfo;
  res.json(data);
})


app.get('/api/get_history', async function(req, res) {
  const address = config.getConfig().address;
  const httpEndpoint = config.getConfig().httpEndpoint;
  const options = {
    uri: `${httpEndpoint}/v1/ETH/addresses/${address}/transactions`,
  }

  request(options, (error, response, result) => {
    let txs = JSON.parse(result);
    for (let i = 0; i < txs.length; i++) {
      txs[i].value = web3.utils.fromWei(txs[i].value.toString(), 'ether');
    }

    res.json(txs);
  });
})

app.get('/api/get_token', async function(req, res) {
  let data = {}
  for (let i = 0; i < token_list.length; i++) {
    const token_Contract = new web3.eth.Contract(tokenAbi, token_list[i]);
    const token_symbol = await token_Contract.methods.symbol().call();
    const token_balance = await token_Contract.methods.balanceOf(address).call();
    data[i] = {
      symbol: token_symbol,
      balance: token_balance
    }
  }
  res.json(data);
})

app.post('/api/add_token', async function(req, res) {
  const contractAddress = req.param('token_contract');
  token_list.push(contractAddress);
})

module.exports = app;
