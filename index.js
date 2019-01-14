var _ = require("lodash"),
  parse = require("xml2js").parseString,
  xpath = require("xpath"),
  dom = require("xmldom").DOMParser,
  yauzl = require("yauzl");

var APP_XML = require("./app.xml.json"),
  CORE_XML = require("./core.xml.json");

var customPropertiesSettings = [];

function provideCustomPropertiesSettings(settings) {
  if (!_.isArray(settings)) {
    console.error("Incorrect custom properties settings");

    return;
  }

  customPropertiesSettings = settings;
}

function fromBuffer(buffer, cb) {
  if (buffer && buffer instanceof Buffer && typeof cb === "function") {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, function(err, zipfile) {
      if (err) return cb(err, null);

      readEntries(zipfile, cb);
    });
  } else {
    if (typeof cb === "function") {
      cb(new Error("Incorrect parameters."), null);
    } else {
      console.error("Incorrect parameters.");
    }
  }
}

function fromFilePath(filePath, cb) {
  if (typeof filePath === "string" && typeof cb === "function") {
    yauzl.open(filePath, { lazyEntries: true }, function(err, zipfile) {
      if (err) return cb(err, null);

      readEntries(zipfile, cb);
    });
  } else {
    if (typeof cb === "function") {
      cb(new Error("Incorrect parameters."), null);
    } else {
      console.error("Incorrect parameters.");
    }
  }
}

function readEntries(zipfile, cb) {
  var data = {};

  zipfile.readEntry();

  zipfile.on("end", function() {
    cb(null, sortByKeys(data));
  });

  zipfile.on("entry", function(entry) {
    switch (entry.fileName) {
      case "docProps/app.xml":
        readEntryStreamXML(zipfile, entry, function(err, result) {
          _.assign(data, getDocumentProperties(result, APP_XML));
          zipfile.readEntry();
        });
        break;
      case "docProps/core.xml":
        readEntryStreamXML(zipfile, entry, function(err, result) {
          _.assign(data, getDocumentProperties(result, CORE_XML));
          zipfile.readEntry();
        });
        break;
      case "docProps/custom.xml":
        readEntryStreamXMLasDOM(zipfile, entry, function(err, result) {
          _.assign(
            data,
            getCustomDocumentProperties(result, customPropertiesSettings)
          );
          zipfile.readEntry();
        });
        break;
      default:
        zipfile.readEntry();
    }
  });
}

function readEntryStreamXML(zipfile, entry, cb) {
  zipfile.openReadStream(entry, function(err, readStream) {
    var data = "";

    if (err) return cb(err, null);

    readStream.on("data", function(chunk) {
      data += chunk;
    });

    readStream.on("end", function() {
      parse(data, function(err, result) {
        if (err) return cb(err, null);

        cb(null, result);
      });
    });
  });
}

function readEntryStreamXMLasDOM(zipfile, entry, cb) {
  zipfile.openReadStream(entry, function(err, readStream) {
    let data = "";

    if (err) return cb(err, null);

    readStream.on("data", function(chunk) {
      data += chunk;
    });

    readStream.on("end", function() {
      cb(null, new dom().parseFromString(data));
    });
  });
}

function getDocumentProperties(obj, props) {
  var data = {};

  _.forEach(props, function(prop) {
    var val;

    if (_.has(obj, prop.path)) {
      switch (prop.type) {
        case "number":
          val = _.toNumber(_.get(obj, prop.path));
          break;
        case "string":
        default:
          val = _.toString(_.get(obj, prop.path));
      }

      if (prop.type == "string" && _.isEmpty(val)) return;

      _.set(data, prop.name, val);
    }
  });

  return data;
}
function getCustomDocumentProperties(domObj, props) {
  var data = {};

  var select = xpath.useNamespaces({
    cp:
      "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
    vt: "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"
  });

  _.forEach(props, function(prop) {
    var val;

    var xpathResult = select(
      `//cp:Properties/cp:property[@name="${prop.msName}"]/vt:lpwstr/text()`,
      domObj
    );

    if (xpathResult.length) {
      switch (prop.type) {
        case "number":
          val = _.toNumber(xpathResult[0].nodeValue);
          break;
        case "string":
        default:
          val = _.toString(xpathResult[0].nodeValue);
      }

      if (prop.type == "string" && _.isEmpty(val)) return;

      _.set(data, prop.name, val);
    }
  });

  return data;
}

sortByKeys = object => {
  const keys = Object.keys(object);
  const sortedKeys = _.sortBy(keys);

  return _.fromPairs(_.map(sortedKeys, key => [key, object[key]]));
};

module.exports = {
  provideCustomPropertiesSettings: provideCustomPropertiesSettings,
  fromBuffer: fromBuffer,
  fromFilePath: fromFilePath
};
