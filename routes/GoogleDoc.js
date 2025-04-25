const { google } = require('googleapis');
const express = require('express');
const router = express.Router();

router.post('/generate-receipt', async (req, res) => {
    try {
      const { accessToken, receiptData } = req.body;
      const docId = await generateReceipt(accessToken, receiptData);
      res.json({ success: true, docId, url: `https://docs.google.com/document/d/${docId}/edit` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

const generateReceipt = async (accessToken, receiptData) => {
  const docs = google.docs({ version: 'v1', auth: accessToken });
  const drive = google.drive({ version: 'v3', auth: accessToken });

  // 1. Copy the template
  const templateId = '1V6hBos7hjSYL-ldrBTy8WvuBF7O0VFle43z99mj4p5Q';
  const copyResponse = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: `Receipt_${Date.now()}` },
  });
  const newDocId = copyResponse.data.id;

  // 2. Find the location of {{product_rows}} in the template
  const doc = await docs.documents.get({ documentId: newDocId });
  const requests = [];
  let productRowLocation = null;

  // Search for {{product_rows}} placeholder
  doc.data.body.content.forEach((element) => {
    if (element.paragraph && element.paragraph.elements) {
      element.paragraph.elements.forEach((elem) => {
        if (elem.textRun && elem.textRun.content.includes('{{product_rows}}')) {
          productRowLocation = element.startIndex;
        }
      });
    }
  });

  if (!productRowLocation) {
    throw new Error('Placeholder {{product_rows}} not found in the template!');
  }

  // 3. Delete the placeholder row
  requests.push({
    deleteContentRange: {
      range: {
        startIndex: productRowLocation,
        endIndex: productRowLocation + 1, // Adjust based on your template
      },
    },
  });

  // 4. Insert dynamic product rows
  receiptData.products.forEach((product, index) => {
    const rowStartIndex = productRowLocation + index * 4; // Adjust offset based on your table
    requests.push(
      {
        insertTableRow: {
          tableCellLocation: {
            tableStartLocation: { index: rowStartIndex },
          },
          insertBelow: true,
        },
      },
      // Replace placeholders in the new row
      {
        replaceAllText: {
          containsText: { text: '{{product_name}}', matchCase: true },
          replaceText: product.name,
        },
      },
      {
        replaceAllText: {
          containsText: { text: '{{quantity}}', matchCase: true },
          replaceText: product.quantity.toString(),
        },
      },
      {
        replaceAllText: {
          containsText: { text: '{{price}}', matchCase: true },
          replaceText: `$${product.price.toFixed(2)}`,
        },
      }
    );
  });

  // 5. Calculate and update total
  const total = receiptData.products.reduce((sum, product) => sum + product.price * product.quantity, 0);
  requests.push({
    replaceAllText: {
      containsText: { text: '{{total}}', matchCase: true },
      replaceText: `$${total.toFixed(2)}`,
    },
  });

  // 6. Execute all requests
  await docs.documents.batchUpdate({
    documentId: newDocId,
    requestBody: { requests },
  });

  return newDocId;
};



module.exports = router;