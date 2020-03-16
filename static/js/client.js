$(() => {

  const regexStart = /<\|s\|*\>*|<*\|*s\|>/g;
  const regexEnd = /<\|e\|*\>*|<*\|*e\|>/g;
  const regexElse = /<\|*|\|*>/;

  $('#gen-form').submit(function (e) {
    e.preventDefault();
    const vals = getInputValues();
    console.log('vals:', vals);
    generate(vals);

  });

  function generate(vals) {
    $.ajax({
      type: "POST",
      url: "/",
      dataType: "json",
      data: JSON.stringify(vals),
      beforeSend: function (data) {
        // character given only on form submit
        if (vals.hasOwnProperty('character')) {
          // diable generate button
          $('#generate-text').addClass("is-loading");
          $('#generate-text').prop("disabled", true);
          $('#tutorial').remove();
          // print user input to output screen
          const chrct = `<div>${vals.character}</div>`;
          const blather = vals.prefix.replace(/\n\n/g, "<div><br></div>").replace(/\n/g, "<div></div>");
          const prompt = `<div class="gen-box-right">${chrct}${blather}</div>`
          $(prompt).appendTo('#model-output').hide().fadeIn("slow");
          // make suggestions actual text if they weren't, empty prefix box
          $('#character').val($('#character').attr('placeholder'));
          $('#prefix').val('');
          $('#prefix').attr('placeholder', '');
          // create empty div to receive our answer
          $('<div class="gen-box"></div>').appendTo("#model-output");
        }
      },
      success: function (data) {
        console.log(data);
        const answer = JSON.parse(data.text);
        console.log(answer);
        let recall = true;
        let gentext = "";
        if (regexStart.test(answer)) {
          gentext = answer
            .replace(regexStart, "")
            .replace(/\n/g, "<br>");
          console.log("regex start found");
          console.log("data:", data);
          console.log("edited:", gentext);
        } else if (regexEnd.test(answer)) {
          gentext = answer
            .replace(regexEnd, "")
            .replace(/\n/g, "<br>");
          console.log("regex end found");
          console.log("data:", data);
          console.log("edited:", gentext);
          recall = false;
        } else {
          gentext = answer
            .replace(regexElse, "")
            .replace(/\n/g, "<br>");
        }

        $(".gen-box:last").append(gentext);

        if (recall) {
          const newVals = { "prefix" : "" };
          generate(newVals);
        } else {
          // do this only if found end marker
          $('#generate-text').removeClass("is-loading");
          $('#generate-text').prop("disabled", false);
        }
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.log("ajax error");
        console.log(jqXHR);
        console.log(textStatus);
        console.log(errorThrown);

        // restore button state
        $('#generate-text').removeClass("is-loading");
        $('#generate-text').prop("disabled", false);
        // $('#tutorial').remove();
        // const html = '<div class="gen-box warning">There was an error generating the text! Please try again!</div><div class="gen-border"></div>';
        // $(html).appendTo('#model-output').hide().fadeIn("slow");
      }
    });
  }

    // $('#gen-form').submit(function (e) {
    //   e.preventDefault();
    //   if ("WebSocket" in window) {
    //     const params = getInputValues();
    //     let ws = new WebSocket("ws://0.0.0.0:8080/ws");
    //     console.log("Opening websocket connection");
    //     const reg = /\n*<\|*[se]*\|*>*\n*|\n*<*\|*[se]*\|*>\n*/g
    //     ws.onopen = () => {

    //     // ws.send(JSON.stringify(params));
    //     $('#generate-text').addClass("is-loading");
    //     $('#generate-text').prop("disabled", true);
    //     $('#tutorial').remove();
    //     const chrct = `<div>${params.character}</div>`;
    //     const blather = params.prefix.replace(/\n\n/g, "<div><br></div>").replace(/\n/g, "<div></div>");
    //     const prompt = `<div class="gen-box-right">${chrct}${blather}</div>`
    //     $('#character').val($('#character').attr('placeholder'));
    //     $('#prefix').val('');
    //     $('#prefix').attr('placeholder', '');
    //     $(prompt).appendTo('#model-output').hide().fadeIn("slow");
    //     $('<div class="gen-box"></div>').appendTo('#model-output');

    //   };
    //   ws.onmessage = (e) => {
    //     gentext = e.data.replace(reg, '');
    //     gentext = gentext.replace(/\n/g, "<br>");
    //     // console.log('data:', e.data);
    //     // console.log('edited:', gentext);
    //     $('.gen-box:last').append(gentext);
    //     // const html = `<div class="gen-box">${gentext}</div>`;
    //     // $(html).appendTo('#model-output').hide().fadeIn("slow");
    //   };
    //   ws.onclose = () => {
    //     console.log("Closing websocket connection");
    //     $('#generate-text').removeClass("is-loading");
    //     $('#generate-text').prop("disabled", false);
    //   };
    //   ws.onerror = (jqXHR, textStatus, errorThrown) => {
    //     console.log(`jqXHR ${jqXHR}`);
    //     console.log(`textStatus: ${textStatus}`);
    //     console.log(`errorThrown: ${errorThrown}`);
    //     $('#generate-text').removeClass("is-loading");
    //     $('#generate-text').prop("disabled", false);
    //     // const html = '<div class="gen-box warning">There was an error generating the text! Please try again!</div><div class="gen-border"></div>';
    //     // $(html).appendTo('#model-output').hide().fadeIn("slow");
    //   };
    // } else {
    //   alert("WebSockets not supported in your browser, please use the latest Firefox, Chrome, or similar!");
    // }
  // });

  $('#clear-text').click(function (e) {
    $('#prefix').attr('placeholder', "Enfin vous l'emportez, et la faveur du Roi\nVous élève en un rang qui n'était dû qu'à moi,\nIl vous fait Gouverneur du Prince de Castille.");
    e.preventDefault();
    $('#model-output').text('')
    $.ajax({
      type: "GET",
      url: "/"
    });
  });

});

function getInputValues() {
  const inputs = {};
  $("textarea, input").each(function () {
    const v = $(this).val();
    if (v){
      inputs[$(this).attr('id')] = $(this).val();
    } else {
      inputs[$(this).attr('id')] = $(this).attr('placeholder');
    }
  });
  return inputs;
}

// Make sure this code gets executed after the DOM is loaded.
document.querySelectorAll("#prefix,#character").forEach(el => {
  el.addEventListener("keyup", event => {
    if (event.key == "Enter" && event.ctrlKey) {
      document.querySelector("#generate-text").click();
      return;
    }
  })
});
