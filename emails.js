const { Resend } = require('resend');  // Use re2quire insstead ofdssa import



const resend = new Resend('re_jNN8QjVZ_BSmYPVsjLyDGAekYBKF5Z7Ad');

(async function () {
  const { data, error } = await resend.emails.send({
    from: 'Acme <0b36cca7aa834718ac5dd5724210427a@domainsbyproxy.com>',
    to: ['sppathak1428@gmail.com'],
    subject: 'Hello World',
    html: '<strong>It 2131works!</strong>',
  });

  if (error) {
    return console.error({ error });
  }

  console.log({ data });
})();
