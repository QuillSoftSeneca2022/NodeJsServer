const { PDFNet } = require("@pdftron/pdfnet-node");
const fs = require("fs");

const dumpAllText = async (reader) => {
  let element;
  let bbox;
  let arr;
  let text = "";
  while ((element = await reader.next()) !== null) {
    switch (await element.getType()) {
      case PDFNet.Element.Type.e_text_begin:
        console.log("\n--> Text Block Begin");
        text += "\n--> Text Block Begin";
        break;
      case PDFNet.Element.Type.e_text_end:
        console.log("\n--> Text Block End");
        text += "\n--> Text Block End";
        break;
      case PDFNet.Element.Type.e_text:
        bbox = await element.getBBox();
        console.log(
          "\n--> BBox: " +
            bbox.x1.toFixed(2) +
            ", " +
            bbox.y1.toFixed(2) +
            ", " +
            bbox.x2.toFixed(2) +
            ", " +
            bbox.y2.toFixed(2) +
            "\n"
        );
        text +=
          "\n--> BBox: " +
          bbox.x1.toFixed(2) +
          ", " +
          bbox.y1.toFixed(2) +
          ", " +
          bbox.x2.toFixed(2) +
          ", " +
          bbox.y2.toFixed(2) +
          "\n";
        arr = await element.getTextString();
        console.log(arr);
        text += arr;
        break;
      case PDFNet.Element.Type.e_text_new_line:
        console.log("\n--> New Line");
        text += "\n--> New Line";
        break;
      case PDFNet.Element.Type.e_form:
        reader.formBegin();
        await dumpAllText(reader);
        reader.end();
        break;
    }
  }
  return text;
};
const rectTextSearch = async (reader, pos, srchStr) => {
  let element;
  let arr;
  while ((element = await reader.next()) !== null) {
    let bbox;
    switch (await element.getType()) {
      case PDFNet.Element.Type.e_text:
        bbox = await element.getBBox();
        if (await bbox.intersectRect(bbox, pos)) {
          arr = await element.getTextString();
          srchStr += arr + "\n";
        }
        break;
      case PDFNet.Element.Type.e_text_new_line:
        break;
      case PDFNet.Element.Type.e_form:
        reader.formBegin();
        srchStr += await rectTextSearch(reader, pos, srchStr); // possibly need srchStr = ...
        reader.end();
        break;
    }
  }
  return srchStr;
};

const readTextFromRect = async (page, pos, reader) => {
  let srchStr = "";
  reader.beginOnPage(page); // uses default parameters.
  srchStr += await rectTextSearch(reader, pos, srchStr);
  reader.end();
  return srchStr;
};

const twoDigitHex = function (num) {
  const hexStr = num.toString(16).toUpperCase();
  return ("0" + hexStr).substr(-2);
};

const printStyle = async (s) => {
  const rgb = await s.getColor();
  const rColorVal = await rgb.get(0);
  const gColorVal = await rgb.get(1);
  const bColorVal = await rgb.get(2);
  const rgbHex =
    twoDigitHex(rColorVal) + twoDigitHex(gColorVal) + twoDigitHex(bColorVal);
  const fontName = await s.getFontName();
  const fontSize = await s.getFontSize();
  //

  const serifOutput = (await s.isSerif()) ? " sans-serif; " : " ";
  const italicifOutput = (await s.isItalic()) ? " italic;" : "";
  const boldifOutput = (await s.getWeight()) == 700 ? " bold;" : "";
  const returnString =
    ' style="font-family:' +
    fontName +
    "; font-size:" +
    fontSize +
    ";" +
    serifOutput +
    "color:#" +
    rgbHex +
    ";" +
    boldifOutput +
    italicifOutput;
  return returnString;
};
const main = async () => {
  let ret = 0;
  try {
    await PDFNet.startDeallocateStack();

    const inputPath = "./uploads/";
    const inputFilename = "input_file.pdf";
    const outputPath = "./test/";
    const doc = await PDFNet.PDFDoc.createFromFilePath(
      inputPath + inputFilename
    );
    doc.initSecurityHandler();
    const page = await doc.getPage(1);

    if (page.id === "0") {
      console.log("Page not found.");
      return 1;
    }

    const txt = await PDFNet.TextExtractor.create();
    txt.begin(page);

    const pageCount = await doc.getPageCount();
    let totalLineCount = 0;
    let fonts = [],
      fontSizes = [],
      fontColors = [];
    let text = "",
      headings = "",
      paragraphs = `<?xml version="1.0" encoding="UTF-8"?>
      <TEI xml:space="preserve" xmlns="http://www.tei-c.org/ns/1.0" 
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
      xsi:schemaLocation="http://www.tei-c.org/ns/1.0 https://raw.githubusercontent.com/kermitt2/grobid/master/grobid-home/schemas/xsd/Grobid.xsd"
       xmlns:xlink="http://www.w3.org/1999/xlink">
        <teiHeader xml:lang="en">
          <fileDesc>
            <sourceDesc>
              <biblStruct>
                <analytic>`;
    let possibleHeaders = [];
    let abstractLineNum = 0;
    let isAbstract = false;

    // show basic information on console.log
    console.log("Total page count : ", pageCount);

    // 1st big for loop for all pages - to get possible heading information
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const txt = await PDFNet.TextExtractor.create();
      txt.begin(page);
      // inner for loop for all the lines
      for (
        line = await txt.getFirstLine();
        await line.isValid();
        line = await line.getNextLine()
      ) {
        const lineStyle = await line.getStyle();
        let fontStr = await printStyle(lineStyle);
        let font = fontStr.slice(
          fontStr.indexOf(":") + 1,
          fontStr.indexOf(";")
        );
        fonts.push(font);

        let fontSize = fontStr.slice(
          fontStr.indexOf("font-size") + 10,
          fontStr.indexOf("color") - 2
        );
        fontSizes.push(fontSize);

        let fontColor = fontStr.slice(fontStr.indexOf("color") + 6, -1);
        fontColors.push(fontColor);
        if (i == 1) {
          // in the first page, store all the lines to check repetitive header/footer
          let tempText = "";
          for (
            word = await line.getFirstWord();
            await word.isValid();
            word = await word.getNextWord()
          ) {
            tempText += (await word.getString()) + " ";
          }
          possibleHeaders.push(tempText);
          // if it includes 'abstract', set up the flag
          if (tempText.trim().match(/abstract/i)) {
            isAbstract = true;
          }
        } else {
          // from the second page, store only repetitive lines
          let tempText = "";
          for (
            word = await line.getFirstWord();
            await word.isValid();
            word = await word.getNextWord()
          ) {
            tempText += (await word.getString()) + " ";
            if (possibleHeaders.includes(tempText)) {
              possibleHeaders.push(tempText);
            }
          }
        }
      }
    } // first for loop ends

    // All the meta data for different styles
    const HeaderData = possibleHeaders.reduce((accu, curr) => {
      accu[curr] = (accu[curr] || 0) + 1;
      return accu;
    }, {});
    const values = Object.values(HeaderData);
    const max = Math.max(...values);
    const Headers = Object.keys(HeaderData).filter((a) => HeaderData[a] == max);

    const fontsData = fonts.reduce((accu, curr) => {
      accu[curr] = (accu[curr] || 0) + 1;
      return accu;
    }, {});
    const commonFont = Object.keys(fontsData).sort(
      (a, b) => fontsData[b] - fontsData[a]
    )[0];
    const fontsSizeData = fontSizes.reduce((accu, curr) => {
      accu[curr] = (accu[curr] || 0) + 1;
      return accu;
    }, {});
    const commonFontSize = Object.keys(fontsSizeData).sort(
      (a, b) => fontsSizeData[b] - fontsSizeData[a]
    )[0];
    const biggestFontSize = Object.keys(fontsSizeData).sort(
      (a, b) => parseFloat(b) - parseFloat(a)
    )[0];
    const fontsColorData = fontColors.reduce((accu, curr) => {
      accu[curr] = (accu[curr] || 0) + 1;
      return accu;
    }, {});
    const commonFontColor = Object.keys(fontsColorData).sort(
      (a, b) => fontsColorData[b] - fontsColorData[a]
    )[0];

    // 2nd for loop for all pages
    let isAfterReference = false;
    for (let i = 1; i <= pageCount; i++) {
      let headingNumberArray = [];
      let pageNumberArray = [];
      let word;
      const page = await doc.getPage(i);

      if (page.id === "0") {
        console.log("Page not found.");
        return 1;
      }
      const txt = await PDFNet.TextExtractor.create();
      txt.begin(page);

      text += `page number : ${i} ------------------------ \n\n`;
      headings += `\n\npage number : ${i} ------------------------ \n`;

      // For Loop for each line and extract those to text
      let isBracketed = false;

      for (
        line = await txt.getFirstLine();
        await line.isValid();
        line = await line.getNextLine()
      ) {
        totalLineCount += 1;
        const currentLineNum = await line.getCurrentNum();
        const lineStyle = await line.getStyle();
        let fontStr = await printStyle(lineStyle);
        let font = fontStr.slice(
          fontStr.indexOf(":") + 1,
          fontStr.indexOf(";")
        );
        let fontSize = fontStr.slice(
          fontStr.indexOf("font-size") + 10,
          fontStr.indexOf("color") - 2
        );
        let fontColor = fontStr.slice(fontStr.indexOf("color") + 6, -1);
        let words = "";

        // check different font styles for heading materials
        if (
          (font !== commonFont ||
            fontColor !== commonFontColor ||
            fontStr.indexOf("bold;") !== -1) &&
          parseFloat(fontSize) >= parseFloat(commonFontSize) - 0.5
        ) {
          for (
            word = await line.getFirstWord();
            await word.isValid();
            word = await word.getNextWord()
          ) {
            words += (await word.getString()) + " ";
          }
          // extracting headings in special fonts data
          if (words.trim().match(/^[0-9]+$/) == null) {
            headings += words + " ";
            headingNumberArray.push(currentLineNum);
            if (words.trim().match(/abstract/i) != null) {
              abstractLineNum = currentLineNum;
            }
          } else {
            pageNumberArray.push(currentLineNum);
          }
        }
        text += `<Line ${await printStyle(
          lineStyle
        )} line_num="${currentLineNum}">`;

        // 2nd loop - For each word in every line...
        let extractedString = "";

        for (
          word = await line.getFirstWord();
          await word.isValid();
          word = await word.getNextWord()
        ) {
          // output bounding box for the word
          let outputStringWord = "";
          const sz = await word.getStringLen();
          if (sz === 0) {
            continue;
          }
          outputStringWord += await word.getString();
          text += outputStringWord + " ";

          if (outputStringWord.includes("(")) {
            isBracketed = true;
          }
          if (!isBracketed) {
            extractedString += outputStringWord + " ";
          }
          if (outputStringWord.includes(")")) {
            isBracketed = false;
          }
        }
        // End of the each line
        text += "</Line>\n";

        // check all the headings
        if (!isAfterReference) {
          if (i == 1 && !isAbstract) {
            // in case of no abstract
            if (headingNumberArray[0] == currentLineNum) {
              paragraphs += `<title>${extractedString}</title>\n`;
              paragraphs += `</analytic>
              </biblStruct>
            </sourceDesc>
          </fileDesc>
      
          <profileDesc>
            <abstract/>
          </profileDesc>
        </teiHeader>
      
        <text xml:lang="en">
          <body>
          <div><p>`;
            }
          }
          if (i == 1 && isAbstract) {
            // title until abstract
            if (extractedString.trim().match(/abstract/i)) {
              // very first head
              paragraphs += `</analytic>
              </biblStruct>
            </sourceDesc>
          </fileDesc>
      
          <profileDesc>
            <abstract/>
          </profileDesc>
        </teiHeader>
      
        <text xml:lang="en">
          <body>`;
              paragraphs += `<div>`;
              paragraphs += `<head>${extractedString}</head>`;
              paragraphs += `<p>`;
              isAbstract = false;
            } else {
              // title
              paragraphs += `<title>${extractedString}</title>\n`;
            }
          } else if (headingNumberArray.includes(currentLineNum)) {
            // among remaining head...
            console.log(paragraphs.slice(paragraphs.length - 11));
            paragraphs += `</p>`;
            paragraphs += `</div>\n<div>`;
            paragraphs += `<head>` + extractedString + "</head>";
            paragraphs += `<p>`;
          } else {
            // normal line
            paragraphs += `${extractedString}`;
          }
          console.log("is after reference: ", isAfterReference);
          console.log("extracted match ", extractedString.match(/reference/i));
          if (extractedString.trim().match(/reference/i)) {
            console.log("referenced detected", extractedString);
            isAfterReference = true;
          }
        }
      }
    } // End of page iterator for loop
    // End of the document
    text += `\n line count : ${totalLineCount}`;
    paragraphs += "</p></div>\n";
    paragraphs += `</body>
    </text>
  </TEI>`;

    // IF font data is needed, uncomment this to get the info as a file
    //   fs.appendFile(
    //     outputPath + `outputFontData_${inputFilename}.txt`,
    //     text,
    //     (err) => {
    //       if (err) throw err;
    //     }
    //   );
    //   fs.appendFile(
    //     outputPath + `outputHeadingData_${inputFilename}.txt`,
    //     headings,
    //     (err) => {
    //       if (err) throw err;
    //     }
    //   );

    console.log(`total line count : ${totalLineCount}`);
    fs.writeFile(
      outputPath + `paragraphs_${inputFilename}.txt`,
      paragraphs,
      (err) => {
        if (err) throw err;
      }
    );
    console.log("GOT XML DATA", new Date(Date.now()));
    return paragraphs;
  } catch (error) {
    console.log(error);
  }
};

const run = async () => {
  let data = await PDFNet.runWithoutCleanup(
    main,
    "demo:1646664550895:7bea68db03000000001e731609ee0475c019a5832e85c13c9a28dd51ac"
  );
  return data;
};

module.exports = {
  run: run,
};
