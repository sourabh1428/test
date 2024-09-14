const { Resend } = require('resend');  // Use require instead of import



const resend = new Resend('re_jNN8QjVZ_BSmYPVsjLyDGAekYBKF5Z7Ad');

(async function () {
  const { data, error } = await resend.emails.send({
    from: 'Acme <sppathak12488@gmail.com>',
    to: ['sppathak1428@gmail.com'],
    subject: 'Hello World',
    html: '<strong>It works!</strong>',
  });

  if (error) {
    return console.error({ error });
  }

  console.log({ data });
})();
