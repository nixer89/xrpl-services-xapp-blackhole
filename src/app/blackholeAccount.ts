import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { XRPLWebsocket } from './services/xrplWebSocket';
import { Observable, Subject, Subscription } from 'rxjs';
import { TransactionValidation, GenericBackendPostRequest } from './utils/types';
import * as flagUtil from './utils/flagutils';
import { MatStepper } from '@angular/material/stepper';
import { isValidXRPAddress } from 'src/app/utils/utils';
import { XummService } from 'src/app/services/xumm.service';
import { TypeWriter } from './utils/TypeWriter';
import { OverlayContainer } from '@angular/cdk/overlay';
import { XummTypes } from 'xumm-sdk';
import { MatLegacySnackBar as MatSnackBar } from '@angular/material/legacy-snack-bar';
import * as clipboard from 'copy-to-clipboard';

@Component({
  selector: 'blackholeAccount',
  templateUrl: './blackholeAccount.html',
  styleUrls: ['./blackholeAccount.css']
})
export class BlackholeAccount implements OnInit, OnDestroy {

  private ACCOUNT_FLAG_DISABLE_MASTER_KEY:number = 4;
  private ACCOUNT_FLAG_DISABLE_INCOMING_XRP:number = 3;

  constructor(
    private xummService: XummService,
    private xrplWebSocket: XRPLWebsocket,
    private overlayContainer: OverlayContainer,
    private snackBar: MatSnackBar) { }

  @Input()
  ottChanged: Observable<any>;

  @Input()
  themeChanged: Observable<any>;

  private ottReceived: Subscription;
  private themeReceived: Subscription;

  checkBoxTwoAccounts:boolean = false;
  checkBoxIssuerInfo:boolean = false;
  checkBoxSufficientFunds:boolean = false;
  checkBoxFiveXrp:boolean = false;
  checkBoxNetwork:boolean = false;
  checkBoxNoLiability:boolean = false;
  checkBoxDisclaimer:boolean = false;

  checkBoxBlackhole1:boolean = false;
  checkBoxBlackhole2:boolean = false;
  checkBoxBlackhole3:boolean = false;
  checkBoxBlackhole4:boolean = false;
  checkBoxBlackhole5:boolean = false;

  checkBoxIssuingText:boolean = false;

  checkBoxIgnoreOwnerCount:boolean = false;

  hasSignerList:boolean = false;

  hasTokenBalance:boolean = false;
  hasOwnerCount:boolean = false;

  blackholeDisallowXrp:boolean = false;
  blackholeRegularKeySet:boolean = false;
  blackholeMasterDisabled:boolean = false;

  issuer_account_info:any;
  recipient_account_info:any;
  isTestMode:boolean = false;

  private issuerAccount: string;
  private recipientAccount: string;
  //private issuerAccount: string;
  validIssuer:boolean = false;
  validRecipient:boolean = false;

  transactionSuccessfull: Subject<void> = new Subject<void>();

  paymentInitiated: boolean = false;
  paymentNotSuccessfull:boolean = true;
  loadingData:boolean = false;

  accountReserve:number = 1000000;
  ownerReserve:number = 200000;

  paymentAmount:number = 15;
  paymentCurrency:string = "XRP";

  title: string = "XRPL Services xApp";
  tw: TypeWriter
  
  themeClass = 'dark-theme';
  backgroundColor = '#000000';

  fixAmounts:any = null;

  errorLabel:string = null;

  loadingBackend:boolean = true;
  backendAvailable:boolean = false;

  @ViewChild('stepper') stepper: MatStepper;

  async ngOnInit() {
    this.loadingData = true;

    this.loadingBackend = true;
    this.backendAvailable = await this.xummService.ping();
    this.loadingBackend = false;

    this.ottReceived = this.ottChanged.subscribe(async ottData => {
      //console.log("ottReceived: " + JSON.stringify(ottData));

      await this.loadFeeReserves();
      let fixAmounts:any = await this.xummService.getFixAmounts();

      if(fixAmounts && fixAmounts["*"]) {
        let amount = fixAmounts["*"];

        if(amount && !amount.issuer) {
          let blackholeAmount:number = Number(fixAmounts["*"]);
          this.paymentAmount = blackholeAmount / 1000000;
          this.paymentCurrency = "XRP"
        } else if(amount && amount.issuer) {
          this.paymentAmount = amount.value;
          this.paymentCurrency = amount.currency;
        }
      }

      if(ottData) {

        //this.infoLabel = JSON.stringify(ottData);

        this.fixAmounts = await this.xummService.getFixAmounts();
        
        this.isTestMode = ottData.nodetype == 'TESTNET';

        //this.infoLabel = "changed mode to testnet: " + this.testMode;

        if(ottData && ottData.account && ottData.accountaccess == 'FULL') {

          await this.loadAccountData(ottData.account);
          this.issuerAccount = ottData.account;
          this.loadingData = false;

          //await this.loadAccountData(ottData.account); //false = ottResponse.node == 'TESTNET' 
        } else {
          this.loadingData = false;
          this.issuer_account_info = "no account";
        }
      }

      //this.testMode = true;
      //await this.loadAccountData("rELeasERs3m4inA1UinRLTpXemqyStqzwh");
      //await this.loadAccountData("r9N4v3cWxfh4x6yUNjxNy3DbWUgbzMBLdk");
      //this.loadingData = false;
    });

    this.themeReceived = this.themeChanged.subscribe(async appStyle => {

      this.themeClass = appStyle.theme;
      this.backgroundColor = appStyle.color;

      var bodyStyles = document.body.style;
      bodyStyles.setProperty('--background-color', this.backgroundColor);
      this.overlayContainer.getContainerElement().classList.remove('dark-theme');
      this.overlayContainer.getContainerElement().classList.remove('light-theme');
      this.overlayContainer.getContainerElement().classList.remove('moonlight-theme');
      this.overlayContainer.getContainerElement().classList.remove('royal-theme');
      this.overlayContainer.getContainerElement().classList.add(this.themeClass);
    });
    //this.infoLabel = JSON.stringify(this.device.getDeviceInfo());

    this.tw = new TypeWriter(["XRPL Services xApp", "created by nixerFFM", "XRPL Services xApp"], t => {
      this.title = t;
    })

    this.tw.start();
  }

  ngOnDestroy() {
    if(this.ottReceived)
      this.ottReceived.unsubscribe();

    if(this.themeReceived)
      this.themeReceived.unsubscribe();
  }

  getIssuer(): string {
    return this.issuerAccount;
  }

  async waitForTransactionSigning(payloadRequest: GenericBackendPostRequest): Promise<any> {
    this.loadingData = true;
    //this.infoLabel = "Opening sign request";
    let xummResponse:XummTypes.XummPostPayloadResponse;
    try {
        payloadRequest.options.pushDisabled = true;
        payloadRequest.payload.options = {
          expire: 2
        }

        if(isValidXRPAddress(payloadRequest.payload.txjson.Account+"")) {
          payloadRequest.payload.options.signers = [payloadRequest.payload.txjson.Account+""];
        }

        //console.log("sending xumm payload: " + JSON.stringify(xummPayload));
        xummResponse = await this.xummService.submitPayload(payloadRequest);
        //this.infoLabel = "Called xumm successfully"
        console.log(JSON.stringify(xummResponse));
        if(!xummResponse || !xummResponse.uuid) {
          this.loadingData = false;
          this.snackBar.open("Error contacting XUMM backend", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
          return;
        }        
    } catch (err) {
        //console.log(JSON.stringify(err));
        this.loadingData = false;
        this.snackBar.open("Could not contact XUMM backend", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        return;
    }

    if (typeof window.ReactNativeWebView !== 'undefined') {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: 'openSignRequest',
        uuid: xummResponse.uuid
      }));
    }

    //this.infoLabel = "Showed sign request to user";
    //remove old websocket
    try {

      return new Promise( async (resolve, reject) => {

        //use event listeners over websockets
        if(typeof window.addEventListener === 'function') {
          window.addEventListener("message", event => {
            try {
              if(event && event.data) {
                let eventData = JSON.parse(event.data);
        
                console.log("WINDOW: " + eventData);

                if(eventData && eventData.method == "payloadResolved") {

                  window.removeAllListeners("message");

                  if(typeof document.addEventListener === 'function') {
                    document.removeAllListeners("message");
                  }

                  if(eventData.reason == "SIGNED") {
                    //create own response
                    let message = {
                      signed: true,
                      payload_uuidv4: eventData.uuid
                    }
                    
                    resolve(message);

                  } else if(eventData.reason == "DECLINED") {
                    //user closed without signing
                    resolve(null)
                  }
                }
              }
            } catch(err) {
              //ignore errors
            }
          });
        }

        //use event listeners over websockets
        if(typeof document.addEventListener === 'function') {
          document.addEventListener("message", event => {
            try {
              let anyEvent:any = event;
              if(anyEvent && anyEvent.data) {
                let eventData = JSON.parse(anyEvent.data);
        
                console.log("WINDOW: " + eventData);

                if(eventData && eventData.method == "payloadResolved") {

                  document.removeAllListeners("message");
                  if(typeof window.addEventListener === 'function') {
                    window.removeAllListeners("message");
                  }

                  if(eventData.reason == "SIGNED") {
                    //create own response
                    let message = {
                      signed: true,
                      payload_uuidv4: eventData.uuid
                    }
                    
                    resolve(message);

                  } else if(eventData.reason == "DECLINED") {
                    //user closed without signing
                    resolve(null)
                  }
                }
              }
            } catch(err) {
              //ignore errors
            }
          });
        }
      });

    } catch(err) {
      this.loadingData = false;
      //this.infoLabel = JSON.stringify(err);
    }
  }

  async changeBlackholeAccount() {
    this.loadingData = true;

    //setting up xumm payload and waiting for websocket
    let backendPayload:GenericBackendPostRequest = {
      options: {
          web: false,
          signinToValidate: true,
          pushDisabled: true
      },
      payload: {
          txjson: {
              TransactionType: "SignIn"
          },
          custom_meta: {
            instruction: "Please choose the account you want to Blackhole.\n\nSign the request to confirm."
          }
      }
    }

    try {

      let message:any = await this.waitForTransactionSigning(backendPayload);

      if(message && message.payload_uuidv4 && message.signed) {
            
        let transactionResult:TransactionValidation = null;
        //check if we are an EscrowReleaser payment
        transactionResult = await this.xummService.checkSignIn(message.payload_uuidv4);

        if(this.issuerAccount && transactionResult && transactionResult.success && transactionResult.account && isValidXRPAddress(transactionResult.account)) {
          this.snackBar.open("Blackhole account changed!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
          this.issuerAccount = transactionResult.account;
          this.validIssuer = true;
  
          await this.loadAccountData(this.issuerAccount);
  
        } else {
          this.issuerAccount = null;
          this.validIssuer = false;
        }

        if(transactionResult && transactionResult.success) {
          await this.loadAccountData(transactionResult.account);
          this.snackBar.open("Sign In successful", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        } else {
          this.snackBar.open("SignIn not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      } else {
        this.snackBar.open("SignIn not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async signInWithRecipientAccount() {
    //this.infoLabel = "signInForDestination";
    this.loadingData = true;
    //setting up xumm payload and waiting for websocket
    let backendPayload:GenericBackendPostRequest = {
      options: {
          web: false,
          signinToValidate: true,
          pushDisabled: true
      },
      payload: {
          txjson: {
              TransactionType: "SignIn"
          },
          custom_meta: {
            instruction: "Please choose the account which should receive the left over XRP.\n\nSign the request to confirm."
          }
      }
    }

    try {

      let message:any = await this.waitForTransactionSigning(backendPayload);

      if(message && message.payload_uuidv4 && message.signed) {
              
        let transactionResult:TransactionValidation = await this.xummService.checkSignIn(message.payload_uuidv4);

        if(transactionResult && transactionResult.success && transactionResult.account && isValidXRPAddress(transactionResult.account)) {
          await this.loadAccountDataRecipient(transactionResult.account);
          this.recipientAccount = transactionResult.account;
          this.validRecipient = true;
  
          //load balance data
  
        } else {
          this.recipientAccount = null;
          this.validRecipient = false;
        }

        if(transactionResult && transactionResult.success) {
          this.snackBar.open("Sign in successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        } else {
          this.snackBar.open("SignIn not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      } else {
        this.snackBar.open("SignIn not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async payForBlackhole() {
    try {
      this.loadingData = true;
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.getIssuer()
        },
        payload: {
          txjson: {
            Account: this.getIssuer(),
            TransactionType: "Payment",
            Memos : [
              {Memo: {MemoType: Buffer.from("[https://xrpl.services]-Memo", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from("Payment to blackhole XRPL account via xApp.", 'utf8').toString('hex').toUpperCase()}},
              {Memo: {MemoType: Buffer.from("Blackhole-Info", 'utf8').toString('hex').toUpperCase(), MemoData: Buffer.from(JSON.stringify({account: this.getIssuer().trim()}) , 'utf8').toString('hex').toUpperCase()}}
            ]
          },
          custom_meta: {
            instruction: "Please pay with the account you want to remove all access for!",
            blob: {
              purpose: "Blackhole Account Service"
            }
          }
        }
      } 
      
      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      if(message && message.payload_uuidv4 && message.signed) {
        this.paymentInitiated = true;
        let info = await this.xummService.checkPayment(message.payload_uuidv4);

        if(info && info.success && info.account && isValidXRPAddress(info.account) && (!info.testnet || this.isTestMode)) {
          this.issuerAccount = info.account;
          this.validIssuer = true;
          this.paymentNotSuccessfull = false;

          this.snackBar.open("Payment successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});

          //refresh amounts
          await this.loadAccountData(this.issuerAccount);
        } else {
          this.paymentNotSuccessfull = true;
          this.snackBar.open("Payment not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      } else {
        this.snackBar.open("Payment not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
      }

    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async loadAccountData(xrplAccount: string) {
    if(xrplAccount) {

      let account_info_request:any = {
        command: "account_info",
        account: xrplAccount,
        signer_lists: true,
        "strict": true,
      }

      let message:any = await this.xrplWebSocket.getWebsocketMessage("blackhole_component_2", account_info_request, this.isTestMode);
      //console.log("websocket message: " + JSON.stringify(message));
      if(message.status && message.type && message.type === 'response') {
        if(message.status === 'success') {
          if(message.result && message.result.account_data) {
            this.issuer_account_info = message.result.account_data;
            //console.log("isser_account_info: " + JSON.stringify(this.issuer_account_info));

            if(this.issuer_account_info.Flags > 0) {
              this.blackholeDisallowXrp = flagUtil.isDisallowXRPEnabled(this.issuer_account_info.Flags);
              this.blackholeMasterDisabled = flagUtil.isMasterKeyDisabled(this.issuer_account_info.Flags);
            }

            this.hasOwnerCount = this.issuer_account_info.OwnerCount && this.issuer_account_info.OwnerCount > 0;
            this.checkBoxIgnoreOwnerCount = !this.hasOwnerCount;

            //console.log("signer list: " + JSON.stringify(message.result.account_data.signer_lists));

            this.hasSignerList = message.result.account_data.signer_lists && message.result.account_data.signer_lists.length > 0;

            this.validIssuer = true;

            //console.log("Balance: " + this.getAvailableBalanceIssuer());
            //console.log("blackholeDisallowXrp: " + this.blackholeDisallowXrp);
            //console.log("blackholeMasterDisabled: " + this.blackholeMasterDisabled);
            //console.log("hasSignerList: " + this.hasSignerList);

          } else {
            //console.log(JSON.stringify(message));
          }

        } else {
          if(message.request.command === 'account_info') {
            this.issuer_account_info = message;
          }
        }
      } else {
        this.issuer_account_info = null;
        this.blackholeMasterDisabled = false;
      }

      //load balance data
      let accountLinesCommand:any = {
        command: "account_lines",
        account: xrplAccount,
        ledger_index: "validated"
      }

      let accountLines:any = await this.xrplWebSocket.getWebsocketMessage('blackhole_component_2', accountLinesCommand, this.isTestMode);
      //console.log("accountLines: " + JSON.stringify(accountLines));
      
      this.hasTokenBalance = accountLines && accountLines.result && accountLines.result.lines && accountLines.result.lines.length > 0 && accountLines.result.lines.filter(line => Number(line.balance) > 0).length > 0;
    }
  }

  async loadAccountDataRecipient(xrplAccount: string) {
    this.loadingData = true;
    //this.infoLabel = "loading " + xrplAccount;
    if(xrplAccount && isValidXRPAddress(xrplAccount)) {
      
      let account_info_request:any = {
        command: "account_info",
        account: xrplAccount,
        "strict": true,
      }

      let message_acc_info:any = await this.xrplWebSocket.getWebsocketMessage("blackhole_component", account_info_request, this.isTestMode);
      //console.log("xrpl-transactions account info: " + JSON.stringify(message_acc_info));
      //this.infoLabel = JSON.stringify(message_acc_info);
      if(message_acc_info && message_acc_info.status && message_acc_info.type && message_acc_info.type === 'response') {
        if(message_acc_info.status === 'success' && message_acc_info.result && message_acc_info.result.account_data) {
          this.recipient_account_info = message_acc_info.result.account_data;
        } else {
          this.recipient_account_info = message_acc_info;
        }
      } else {
        this.recipient_account_info = "no account";
      }
    } else {
      this.recipient_account_info = "no account"
    }
  }

  async sendRemainingXRP() {
    this.loadingData = true;
    try {
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          issuing: true,
          xrplAccount: this.getIssuer()
        },
        payload: {
          txjson: {
            Account: this.getIssuer(),
            TransactionType: "Payment",
            Destination: this.recipient_account_info.Account,
            Amount: (this.getAvailableBalanceIssuer()*1000000).toFixed(0)
          },
          custom_meta: {
            instruction: "- Sending " + this.getAvailableBalanceIssuer() + " XRP to an account of your choice.\n\n- Please sign with the ISSUER account!"
          }
        }
      }

      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      if(message && message.payload_uuidv4 && message.signed) {
        let info = await this.xummService.validateTransaction(message.payload_uuidv4);

        if(info && info.success && info.account && isValidXRPAddress(info.account) && (!info.testnet || this.isTestMode)) {
          this.snackBar.open("Payment successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});

          await this.loadAccountData(this.issuerAccount);
        } else {
          this.snackBar.open("Payment not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }
    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;

  }

  async disallowIncomingXrp() {
    try {
      this.loadingData = true;
    
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          issuing: true,
          xrplAccount: this.getIssuer()
        },
        payload: {
          txjson: {
            Account: this.getIssuer(),
            TransactionType: "AccountSet",
            SetFlag: this.ACCOUNT_FLAG_DISABLE_INCOMING_XRP
          },
          custom_meta: {
            instruction: "- Disallow incoming XRP\n\n- Please sign with the ISSUER account!"
          }
        }
      }

      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      if(message && message.payload_uuidv4 && message.signed) {
        let info = await this.xummService.validateTransaction(message.payload_uuidv4);

        if(info && info.success && info.account && info.testnet == this.isTestMode) {
          this.blackholeDisallowXrp = true;
          this.snackBar.open("Transactions successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        } else {
          this.blackholeDisallowXrp = false;
          this.snackBar.open("Transaction not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }

      this.loadingData = false;
    } catch(err) {
     this.handleError(err)
    }
  }

  async setBlackholeAddress() {
    try {
      this.loadingData = true;
    
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          issuing: true,
          xrplAccount: this.getIssuer()
        },
        payload: {
          txjson: {
            Account: this.getIssuer(),
            TransactionType: "SetRegularKey",
            RegularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji"
          },
          custom_meta: {
            instruction: "Set RegularKey to: rrrrrrrrrrrrrrrrrrrrBZbvji\n\n- Please sign with the ISSUER account!"
          }
        }
      }

      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      if(message && message.payload_uuidv4 && message.signed) {
        let info = await this.xummService.validateTransaction(message.payload_uuidv4);

        if(info && info.success && info.account && info.testnet == this.isTestMode) {
          this.blackholeRegularKeySet = true;
          this.snackBar.open("Transactions successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        } else {
          this.blackholeRegularKeySet = false;
          this.snackBar.open("Transaction not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }
      
    } catch(err) {
     this.handleError(err)
    }

    this.loadingData = false;
  }

  async disableMasterKeyForIssuer() {
    try {
      this.loadingData = true;
    
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.getIssuer()
        },
        payload: {
          txjson: {
            Account: this.getIssuer(),
            TransactionType: "AccountSet",
            SetFlag: this.ACCOUNT_FLAG_DISABLE_MASTER_KEY
          },
          custom_meta: {
            instruction: "- Disable Master Key\n\n- Please sign with the ISSUER account!"
          }
        }
      }

      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      if(message && message.payload_uuidv4 && message.signed) {
        let info = await this.xummService.validateTransaction(message.payload_uuidv4);

        if(info && info.success && info.account && info.testnet == this.isTestMode) {
          this.blackholeMasterDisabled = true;
          this.snackBar.open("Transactions successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        } else {
          this.blackholeMasterDisabled = false;
          this.snackBar.open("Transaction not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }

    } catch(err) {
     this.handleError(err)
    }

    this.loadingData = false;
  }


  async deleteSignerList() {

    try {
      this.loadingData = true;
    
      let genericBackendRequest:GenericBackendPostRequest = {
        options: {
          xrplAccount: this.getIssuer()
        },
        payload: {
          txjson: {
            Account: this.getIssuer(),
            TransactionType: "SignerListSet",
            SignerQuorum: 0
          },
          custom_meta: {
            instruction: 'Delete Signer List.'
          }
        }
      }

      let message:any = await this.waitForTransactionSigning(genericBackendRequest);

      if(message && message.payload_uuidv4 && message.signed) {
        let info = await this.xummService.validateTransaction(message.payload_uuidv4);

        if(info && info.success && info.account && info.testnet == this.isTestMode) {
          this.snackBar.open("Transactions successful!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
          await this.loadAccountData(this.issuerAccount);
        } else {
          this.blackholeMasterDisabled = false;
          this.snackBar.open("Transaction not successful!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
        }
      }

    } catch(err) {
     this.handleError(err)
    }

    this.loadingData = false;
  }

  async loadPaymentsAndNext() {
    this.loadPayments(this.issuerAccount.trim());
    this.moveNext();
  }

  async loadPayments(issuerAccount: string) {
    try {
      this.loadingData = true;

      console.log("checking existing transactions")

      //load account lines
      let accountTransactions:any = {
        command: "account_tx",
        account: issuerAccount,
        limit: 1000
      }

      //console.log("starting to read account lines!")
      console.log("accountTransactions: " + JSON.stringify(accountTransactions));

      let accountTx = await this.xrplWebSocket.getWebsocketMessage('issuer-tx', accountTransactions, this.isTestMode);

      console.log("accountTx: " + JSON.stringify(accountTx));

      if(accountTx?.result?.transactions) {
        
        let transactions:any[] = accountTx?.result?.transactions;

        let marker = accountTx.result.marker;

        for(let i = 0; i < transactions.length; i++) {
          //scanning transactions for previous payments
          console.log("looping through transactions")
          try {
            let transaction = transactions[i];

            console.log("tx " + i + " : " + JSON.stringify(transaction));

            console.log("payment amount to check for: " + JSON.stringify(this.getPurchaseAmountXRP()*1000000).toString());

            if(transaction?.tx?.TransactionType === 'Payment' && transaction?.tx?.Destination === 'rNixerUVPwrhxGDt4UooDu6FJ7zuofvjCF' && transaction?.tx?.Memos && transaction?.meta?.TransactionResult === "tesSUCCESS" && transaction?.meta?.delivered_amount === (this.getPurchaseAmountXRP()*1000000).toString()) {
              //parse memos:
              if(transaction.tx.Memos[1] && transaction.tx.Memos[1].Memo) {
                let memoType = Buffer.from(transaction.tx.Memos[1].Memo.MemoType, 'hex').toString('utf8');
                
                console.log("memoType: " + JSON.stringify(memoType));

                if(this.issuerAccount && memoType === 'Blackhole-Info') {
                  let memoData = JSON.parse(Buffer.from(transaction.tx.Memos[1].Memo.MemoData, 'hex').toString('utf8'));

                  console.log("memoData: " + JSON.stringify(memoData));

                  if(memoData.account === this.issuerAccount.trim()) {
                    this.paymentInitiated = true;
                    this.paymentNotSuccessfull = false;
                    console.log("PAYMENT FOUND!");
                    break;
                  }
                }
              }
            }
          } catch(err) {
            //parse error, continue!
          }
        }

        //console.log("marker: " + marker);
        //console.log("LEDGER_INDEX : " + accountLines.result.ledger_index);

      }
    } catch(err) {
      console.log("ERR LOADING ACC TX")
      console.log(JSON.stringify(err));
    }

    this.loadingData = false;
  }

  getPurchaseAmountXRP(): number {
    if(this.fixAmounts && this.fixAmounts["*"])
      return parseInt(this.fixAmounts["*"]) / 1000000;
    else
      return 20;
  }

  getAvailableBalanceIssuer(): number {
    return this.getAvailableBalance(this.issuer_account_info);
  }

  getAvailableBalance(accountInfo: any): number {
    if(accountInfo && accountInfo.Balance) {
      let balance:number = Number(accountInfo.Balance);
      balance = balance - this.accountReserve; //deduct acc reserve
      balance = balance - (accountInfo.OwnerCount * this.ownerReserve); //deduct owner count
      balance = balance/1000000;

      if(balance >= 0.000001)
        return balance
      else
        return 0;
      
    } else {
      return 0;
    }
  }

  async loadFeeReserves() {
    let fee_request:any = {
      command: "ledger_entry",
      index: "4BC50C9B0D8515D3EAAE1E74B29A95804346C491EE1A95BF25E4AAB854A6A651",
      ledger_index: "validated"
    }

    let feeSetting:any = await this.xrplWebSocket.getWebsocketMessage("fee-settings", fee_request, this.isTestMode);
    
    if('ReserveBase' in feeSetting?.result?.node) {
      this.accountReserve = feeSetting?.result?.node.ReserveBase;
      this.ownerReserve = feeSetting?.result?.node.ReserveIncrement;
    } else {
      this.accountReserve = Number(feeSetting?.result?.node.ReserveBaseDrops);
      this.ownerReserve = Number(feeSetting?.result?.node.ReserveIncrementDrops);
    }

    //console.log("resolved accountReserve: " + this.accountReserve);
    //console.log("resolved ownerReserve: " + this.ownerReserve);
  }

  openTokenTrasher() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      //this.infoLabel = "opening sign request";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: "openBrowser",
        url: "https://xumm.app/detect/xapp:nixer.tokentrasher"
      }));
    }
  }

  moveNext() {
    // complete the current step
    this.stepper.selected.completed = true;
    this.stepper.selected.editable = false;
    // move to next step
    this.stepper.next();
    this.stepper.selected.editable = true;
  }

  moveBack() {
    //console.log("steps: " + this.stepper.steps.length);
    // move to previous step
    this.stepper.selected.completed = false;
    this.stepper.selected.editable = false;

    this.stepper.steps.forEach((item, index) => {
      if(index == this.stepper.selectedIndex-1 && this.stepper.selectedIndex-1 >= 0) {
        item.editable = true;
        item.completed = false;
      }
    })

    this.stepper.previous();
  }

  clearIssuerAccount() {
    this.checkBoxFiveXrp = this.checkBoxNetwork = this.checkBoxSufficientFunds = this.checkBoxTwoAccounts = this.checkBoxNoLiability = this.checkBoxDisclaimer = this.checkBoxIssuingText = this.checkBoxIssuerInfo = false;
    this.issuer_account_info = null;
    this.validIssuer = this.paymentNotSuccessfull = this.hasTokenBalance = false;
    this.checkBoxBlackhole1 = this.checkBoxBlackhole2 = this.checkBoxBlackhole3 = this.checkBoxBlackhole4 =this.checkBoxBlackhole5 = false;
    this.blackholeMasterDisabled = this.blackholeRegularKeySet = this.blackholeDisallowXrp =  false;
    this.hasTokenBalance = this.hasOwnerCount = this.hasSignerList = false;
  }

  reset() {
    this.isTestMode = false;
    this.clearIssuerAccount();
    this.stepper.reset();
  }

  scrollToTop() {
    window.scrollTo(0, 0);
  }

  handleError(err) {
    if(err && JSON.stringify(err).length > 2) {
      this.errorLabel = JSON.stringify(err);
      this.scrollToTop();
    }
    this.snackBar.open("Error occured. Please try again!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
  }

  copyError() {
    if(this.errorLabel) {
      clipboard(this.errorLabel);
      this.snackBar.dismiss();
      this.snackBar.open("Error text copied to clipboard!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
    }
  }
}
