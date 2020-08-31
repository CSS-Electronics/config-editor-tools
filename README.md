# Config Editor - Tools Library

This project includes editor tools for use in React based JSON Schema editors, incl. the CANedge config editor.

[![NPM](https://img.shields.io/npm/v/config-editor-tools.svg)](https://www.npmjs.com/package/config-editor-tools) [![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Installation

```bash
npm install --save config-editor-tools
```

---

### Development testing

You can directly test the "raw" configuration editor by cloning this repository and running below `npm install` in root and in the `example/` folder. After this, run `npm start` in the root as well as in the `example/` folder.

---

### Publishing a new package via npm

To publish your own custom version as an npm package, you can modify the `package.json` and run `npm publish`. You'll need to be logged in first.


## Usage in a parent app
The editor tools are self-contained modals and can be imported into parent apps in a simple way as below:

```jsx
import React from 'react'

import { BitRateModal, FilterModal, EncryptionModal } from 'config-editor-tools'

const App = () => {
  return <FilterModal/>
}

export default App

```

----

## Usage in a config-editor-base modules
A typical use case is to parse a list of editor tools to the [config-editor-base](https://github.com/CSS-Electronics/config-editor-base) module as in e.g. the CANedge configuration editor. This can be done via below syntax:

```jsx 
import React from 'react'
import { connect } from 'react-redux'

import { EncryptionModal } from 'config-editor-tools'
import { EditorSection } from 'config-editor-base'

import * as actionsAlert from '../alert/actions'
import AlertContainer from '../alert/AlertContainer'

class Editor extends React.Component {
  render() {
    let editorTools = [
      {
        name: 'encryption-modal',
        comment: 'Encryption tool',
        class: 'fa fa-lock',
        modal: <EncryptionModal showAlert={this.props.showAlert} />
      }
    ]

    return (
      <div className='file-explorer'>
        <div className='fe-body fe-body-offline'>
          <AlertContainer />
          <EditorSection
            editorTools={editorTools}
            showAlert={this.props.showAlert}
          />
        </div>
      </div>
    )
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    showAlert: (type, message) =>
      dispatch(actionsAlert.set({ type: type, message: message }))
  }
}

export default connect(null, mapDispatchToProps)(Editor)
```

