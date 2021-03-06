// This version of extraction is for every line in the <p> tag.
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
    //const inputFilename = filename;
    const outputPath = "./test/";
    console.log("point 1 ");
    const doc = await PDFNet.PDFDoc.createFromFilePath(
      inputPath + inputFilename
    );
    console.log("point 2 ");
    doc.initSecurityHandler();
    console.log("point 3 ");
    const page = await doc.getPage(1);
    console.log("point 4 ");
    const target_region = await page.getCropBox(); // this method need to be changed

    if (page.id === "0") {
      console.log("Page not found.");
      return 1;
    }
    const txt = await PDFNet.TextExtractor.create();
    txt.begin(page);
    console.log("point 3 ");
    const pageCount = await doc.getPageCount();
    let totalLineCount = 0;
    let fonts = [],
      fontSizes = [],
      fontColors = [];
    let text = "",
      headings = "",
      paragraphs = "<document>\n";
    let possibleHeaders = [];
    let abstractLineNum = 0;
    let isAbstract = false;

    // show basic information on console.log
    console.log("Total page count : ", pageCount);

    // 1st big for loop for all pages
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
    //console.log("common font : ", commonFont);

    const fontsSizeData = fontSizes.reduce((accu, curr) => {
      accu[curr] = (accu[curr] || 0) + 1;
      return accu;
    }, {});
    //console.log("font size data: ", fontsSizeData);

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
    //console.log("font size data: ", fontsColorData);

    const commonFontColor = Object.keys(fontsColorData).sort(
      (a, b) => fontsColorData[b] - fontsColorData[a]
    )[0];
    //console.log("headers or footers", Headers);

    // 2nd for loop for all pages
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
      //console.log(`\npage number : ${i} ------------------------ \n`);

      // For Loop for each line and extract those to text
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
          // total line count
          // output bounding box for the word
          let outputStringWord = "";
          const sz = await word.getStringLen();
          if (sz === 0) {
            continue;
          }
          // if the word style is different from the parent style, output the new style
          // const sty = await word.getStyle();
          // if (!(await sty.compare(lineStyle))) {
          //   outputStringWord += await printStyle(sty);
          // }
          outputStringWord += await word.getString();
          text += outputStringWord + " ";
          extractedString += outputStringWord + " ";
        }
        // End of the each line
        text += "</Line>\n";
        //paragraphs += `<ln>${totalLineCount}</ln>`;
        // check all the headings
        if (Headers.includes(extractedString)) {
          // header and footer case
          if (currentLineNum < 5) {
            paragraphs += `<header><ln id="${totalLineCount}"/>${extractedString}</header>\n`;
          } else {
            paragraphs += `<footer><ln id="${totalLineCount}"/>${extractedString}</footer>\n`;
          }
        } else if (i == 1 && isAbstract) {
          // title until abstract
          if (extractedString.trim().match(/abstract/i)) {
            // very first heading
            paragraphs += "<section>\n";
            paragraphs += `<heading><ln id="${totalLineCount}"/>${extractedString}</heading>\n`;
            isAbstract = false;
          } else {
            // title
            paragraphs += `<title><ln id="${totalLineCount}"/>${extractedString}</title>\n`;
          }
        } else if (headingNumberArray.includes(currentLineNum)) {
          // among remaining heading...
          console.log(paragraphs.slice(paragraphs.length - 11));
          if (
            // if one line before heading is ending with </p>, close section
            paragraphs.slice(paragraphs.length - 5) == "</p>\n" ||
            paragraphs.slice(paragraphs.length - 11) == "</heading>\n"
          ) {
            paragraphs += "</section>\n";
          }
          paragraphs += "<section>\n";
          paragraphs +=
            `<heading><ln id="${totalLineCount}"/>` +
            extractedString +
            "</heading>\n";
        } else if (pageNumberArray.includes(currentLineNum)) {
          // if heading only consists of digits, consider it page number
          paragraphs += `<pagenumber><ln id="${totalLineCount}"/>${extractedString}</pagenumber>\n`;
        } else {
          // normal line
          paragraphs += `<p><ln id="${totalLineCount}"/>${extractedString}</p>\n`;
        }
      }
    } // End of page iterator for loop
    // End of the document
    text += `\n line count : ${totalLineCount}`;
    paragraphs += "</section>\n";
    paragraphs += "</document>\n";

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
    //console.log("point 5 ");
    //console.log("para", paragraphs);

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

  //return paragraphs;
};

const run = async () => {
  //   PDFNet.runWithoutCleanup(
  //     main,
  //     "demo:1646664550895:7bea68db03000000001e731609ee0475c019a5832e85c13c9a28dd51ac"
  //   )
  //     .catch(function (error) {
  //       console.log("Error: " + JSON.stringify(error));
  //     })
  //     .then(function (result) {
  //       console.log("result is in then", result.slice(1, 10));
  //       return result;
  //       //return PDFNet.shutdown();
  //     });
  let data = await PDFNet.runWithoutCleanup(
    main,
    "demo:1646664550895:7bea68db03000000001e731609ee0475c019a5832e85c13c9a28dd51ac"
  );
  return data;
};

module.exports = {
  run: run,
};

// Function Font Data ends here
