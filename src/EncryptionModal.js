import React from "react";
import Select from "react-select";
import OutputField from "./components/OutputField";
import InputField from "./components/InputField";

const options = [
  { value: "new", label: "Generate new encryption key" },
  { value: "existing", label: "Use existing encryption key" },
];

const { detect } = require("detect-browser");
const browser = detect();

// convert BufferArray to Base64 string
function arrayBufferToBase64(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

class EncryptionModal extends React.Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.checkBrowserVersion = this.checkBrowserVersion.bind(this);
    this.importDevicePublicKey = this.importDevicePublicKey.bind(this);
    this.generateAsymmetricKeys = this.generateAsymmetricKeys.bind(this);
    this.exportUserPublicKey = this.exportUserPublicKey.bind(this);
    this.deriveSharedSecretBits = this.deriveSharedSecretBits.bind(this);
    this.createSymmetricKey = this.createSymmetricKey.bind(this);
    this.hmacSha256 = this.hmacSha256.bind(this);
    this.importSymmetricKey = this.importSymmetricKey.bind(this);
    this.encryptField = this.encryptField.bind(this);

    this.state = {
      selectedOption: options[0],
      devicePublicKey: "",
      serverPublicKeyBase64: "",
      symmetricKeyBase64: "",
      symmetricKey: "",
      fieldValueEncryptedBase64: "",
    };
  }

  // Function for checking if the browser is compatible with the encryption tool
  checkBrowserVersion = () => {
    if (location.protocol == "http:") {
      this.props.showAlert(
        "info",
        `The encryption tool is not supported over http:// - please use https://`
      );
      return 0;
    }
    if (
      browser.name != "chrome" &&
      browser.name != "firefox" &&
      browser.name != "opera" &&
      browser.name != "safari"
    ) {
      this.props.showAlert(
        "danger",
        `The encryption tool is not supported on ${browser.name} - please use Chrome, Firefox or Opera instead.`
      );
      return 0;
    }
  };

  // generate user asymmetric key pair (public & private) + use the secret key to derive shared secret
  generateAsymmetricKeys = (devicePublicKey) => {
    window.crypto.subtle
      .generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
      )
      .then( (serverKeys) => {
        this.deriveSharedSecretBits(devicePublicKey, serverKeys.privateKey);
        this.exportUserPublicKey(serverKeys.publicKey);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  // import devicePublicKeyBase64 BufferArray into webcrypto API
  importDevicePublicKey = (devicePublicKeyBase64) => {
    if (this.checkBrowserVersion() == 0) {
      return 0;
    }

    if (devicePublicKeyBase64.length != 88) {
      this.props.showAlert(
        "danger",
        `The device public key, "${devicePublicKeyBase64}", is invalid (length is ${devicePublicKeyBase64.length} - should be 88)`
      );
      return;
    }

    const preByte = new Buffer([4]);
    let devicePublicKeyBuf = new Buffer(devicePublicKeyBase64, "base64");
    devicePublicKeyBuf = Buffer.concat([preByte, devicePublicKeyBuf]);

    window.crypto.subtle
      .importKey(
        "raw",
        devicePublicKeyBuf,
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        []
      )
      .then((devicePublicKey) => {
        this.props.showAlert(
          "info",
          "New server public key & encryption key successfully generated"
        );

        this.setState(
          {
            devicePublicKey: devicePublicKey,
          },
          () => {}
        );

        this.generateAsymmetricKeys(devicePublicKey);
      })
      .catch((err) => {
        this.props.showAlert(
          "danger",
          "The device public key is invalid. Please review it and try again."
        );
        console.error(err);
      });
  };

  // export user public key for use in config file SECURITY section
  exportUserPublicKey = (userPublicKey) => {
    window.crypto.subtle
      .exportKey("raw", userPublicKey)
      .then((keydata) => {
        this.setState({
          serverPublicKeyBase64: arrayBufferToBase64(keydata.slice(1, 65)),
        });
      })
      .catch((err) => {
        console.error(err);
      });
  };

  // derive shared secret based on device public key and the newly generated user secret key
  deriveSharedSecretBits = (devicePublicKey, userSecretKey) => {
    window.crypto.subtle
      .deriveBits(
        {
          name: "ECDH",
          namedCurve: "P-256",
          public: devicePublicKey,
        },
        userSecretKey,
        256
      )
      .then((sharedSecretBits) => {
        const sharedSecretArray = new Uint8Array(sharedSecretBits);
        this.createSymmetricKey(sharedSecretArray);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  // import shared secret ArrayBuffer into CryptoKey (HMAC SHA-256) + create symmetric key via HMAC SHA-256 and "config" as static data
  createSymmetricKey = (sharedSecretArray) => {
    window.crypto.subtle
      .importKey(
        "raw",
        sharedSecretArray,
        {
          name: "HMAC",
          hash: {
            name: "SHA-256",
          },
          length: 256,
        },
        true,
        ["sign", "verify"]
      )
      .then((sharedSecretKey) => {
        this.hmacSha256(sharedSecretKey, "config"); // note that "config" is a pre-specified string also used by the device
      })
      .catch((err) => {
        console.error(err);
      });
  };

  // calculate symmetric key from shared secret using hmac-sha256 and static data
  hmacSha256 = (sharedSecretKey, msg) => {
    const msgBuf = new TextEncoder("utf-8").encode(msg);
    window.crypto.subtle
      .sign(
        {
          name: "HMAC",
        },
        sharedSecretKey,
        msgBuf
      )
      .then((h) => {
        const symmetricKeyBuf = h.slice(0, 16);
        const symmetricKeyBase64 = arrayBufferToBase64(symmetricKeyBuf);

        this.setState({
          symmetricKeyBase64: symmetricKeyBase64,
        });

        this.importSymmetricKey(symmetricKeyBase64);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  // Import the symmetric key (base 64) into a crypto key object
  importSymmetricKey = (symmetricKeyBase64) => {
    if (this.checkBrowserVersion() == 0) {
      return;
    }
    window.crypto.subtle
      .importKey(
        "raw",
        new Buffer(symmetricKeyBase64, "base64"),
        {
          name: "AES-CTR",
        },
        true,
        ["encrypt", "decrypt"]
      )
      .then((symmetricKey) => {
        this.setState({
          symmetricKey: symmetricKey,
        });
      })
      .catch((err) => {
        this.props.showAlert(
          "danger",
          "The encryption key is invalid. Please review it and try again."
        );

        console.error(err);
      });
  };

  // encrypt message field using the imported symmetric key and AES-CTR
  encryptField = (fieldValuePlainText) => {
    var enc = new TextEncoder("utf-8");
    const counter = window.crypto.getRandomValues(new Uint8Array(16)); // serves as initialization vector
    window.crypto.subtle
      .encrypt(
        {
          name: "AES-CTR",
          counter: counter,
          length: 128,
        },
        this.state.symmetricKey,
        enc.encode(fieldValuePlainText)
      )
      .then((fieldValueEncryptedCt) => {
        const fieldValueEncryptedCtTyped = new Uint8Array(
          fieldValueEncryptedCt
        );

        var fieldValueEncrypted = new Uint8Array(
          counter.length + fieldValueEncryptedCtTyped.length
        );
        fieldValueEncrypted.set(counter);
        fieldValueEncrypted.set(fieldValueEncryptedCtTyped, counter.length);
        const fieldValueEncryptedBase64 = arrayBufferToBase64(
          fieldValueEncrypted
        );

        this.setState({
          fieldValueEncryptedBase64: fieldValueEncryptedBase64,
        });
      })
      .catch((err) => {
        console.error(err);
      });
  };

  resetAllKeys = () => {
    this.setState({
      setEncryptedField: "",
      symmetricKeyBase64: "",
      symmetricKey: "",
      serverPublicKeyBase64: "",
    });
  };

  componentWillUnmount() {
    this.resetAllKeys();
  }

  handleChange = (selectedOption) => {
    this.setState(
      {
        selectedOption,
      },
      () => {
        this.resetAllKeys();
      }
    );
  };

  render() {
    this.checkBrowserVersion();

    const { selectedOption } = this.state;
    return (
      <div>
        <h4>Encryption tool</h4>
        <div className="form-group pl0 field-string">
          <p>Mode</p>
          <Select
            value={selectedOption}
            options={options}
            onChange={this.handleChange}
            isSearchable={false}
          />{" "}
          <p className="field-description field-description-shift">
            If you need to encrypt your plain text field data from scratch, you
            can generate a new server public key and encryption key using your
            device public key. If you've done this before, you can alternatively
            re-use your encryption key to avoid having to encrypt all your plain
            text data again.
          </p>
        </div>

        {this.state.selectedOption &&
        this.state.selectedOption.value == "new" ? (
          <InputField
            headerText="Device public key"
            id="devicePublicKeyBase64"
            buttonText="Create keys"
            buttonClick={this.importDevicePublicKey}
            comment="Insert the device public key from your device.json file. The
          tool then generates a server secret/public key
          and an encryption key."
          />
        ) : (
          <div />
        )}

        {this.state.selectedOption &&
        this.state.selectedOption.value == "existing" ? (
          <InputField
            headerText="Encryption key"
            id="symmetricKeyBase64"
            buttonText="Load key"
            buttonClick={this.importSymmetricKey}
            comment="Load a previously generated encryption key to enable the encryption of additional plain text field values. The device will use the related server public key to decrypt the data, allowing you to avoid re-encrypting all plain text fields from scratch."
          />
        ) : (
          <div />
        )}

        {this.state.selectedOption &&
        this.state.selectedOption.value == "new" &&
        this.state.serverPublicKeyBase64 != "" ? (
          <div>
            <OutputField
              headerText="Server public key"
              id="serverPublicKeyBase64"
              masked={false}
              alertMsg={this.props.showAlert}
              rows="4"
              value={this.state.serverPublicKeyBase64}
              comment="The server public key must be provided to the device. This allows the device 
        to decrypt any plain text data that has been encrypted using the derived encryption key."
            />
            <OutputField
              headerText="Encryption key"
              id="symmetricKeyBase64"
              alertMsg={this.props.showAlert}
              masked={true}
              rows="1"
              value={this.state.symmetricKeyBase64}
              comment="The encryption key (aka symmetric key) is used to encrypt plain text data in 
        a way that allows the data to be decrypted by the device. The encryption key should be 
        stored securely if you wish to later encrypt other plain text data without having to re-encrypt everything again."
            />
          </div>
        ) : (
          <div />
        )}

        {this.state.symmetricKey != "" ? (
          <div>
            <hr />
            <InputField
              headerText="Field value (plain text)"
              id="fieldValuePlain"
              alertMsg={this.props.showAlert}
              buttonClick={this.encryptField}
              buttonText="Encrypt text"
              comment="You can use the encryption key to encrypt plain-text. Simply paste a
          plain-text field value below and click encrypt."
            />
          </div>
        ) : (
          <div />
        )}

        {this.state.fieldValueEncryptedBase64 != "" ? (
          <OutputField
            headerText="Field value (encrypted)"
            id="fieldValueEncrypted"
            masked={false}
            alertMsg={this.props.showAlert}
            value={this.state.fieldValueEncryptedBase64}
            comment="The encrypted text can now be passed to the device. Note that the
        device needs the server public key in order to
        decrypt the encrypted text."
          />
        ) : (
          <div />
        )}
      </div>
    );
  }
}

export default EncryptionModal;
