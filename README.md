## Intro

There are 3 repos to run the project currently.

- Client: QuillSoftNewSample
- Server 1: quillsoft-nlp-engine-master (Python server that creates key concepts/clustering)
- Server 2: NodeJsServer (Node.js server that does text extraction)

Client -> (PDF file) -> Server1 -> (PDF file) -> Server2 -> (XML with extracted text) -> Server1 -> (XML text + key concepts) -> Client

## Summary

This is Node.Js server built to

- extract text from pdf file
- reconstruct to XML format

## Installing Required Libraries

```
npm install
```

## How to run the server

```
node index.js
```
