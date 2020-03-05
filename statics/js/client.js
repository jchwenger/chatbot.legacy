$(() => {
  $('#gen-form').submit(function (e) {
    e.preventDefault();
    if ("WebSocket" in window) {
      const params = getInputValues();
      let ws = new WebSocket("ws://localhost:8080/ws");
      console.log("Opening websocket connection");
      const reg = /\n*<\|*[se]*\|*>*\n*|\n*<*\|*[se]*\|*>\n*/g
      ws.onopen = () => {
        ws.send(JSON.stringify(params));
        $('#generate-text').addClass("is-loading");
        $('#generate-text').prop("disabled", true);
        $('#tutorial').remove();
        const chrct = `<div>${params.character}</div>`;
        const blather = params.prefix.replace(/\n\n/g, "<div><br></div>").replace(/\n/g, "<div></div>");
        const prompt = `<div class="gen-box-right">${chrct}${blather}</div>`
        $('#character').val($('#character').attr('placeholder'));
        $('#prefix').val('');
        $('#prefix').attr('placeholder', '');
        $(prompt).appendTo('#model-output').hide().fadeIn("slow");
        $('<div class="gen-box"></div>').appendTo('#model-output');
      };
      ws.onmessage = (e) => {
        gentext = e.data.replace(reg, '');
        gentext = gentext.replace(/\n/g, "<br>");
        // console.log('data:', e.data);
        // console.log('edited:', gentext);
        $('.gen-box:last').append(gentext);
        // const html = `<div class="gen-box">${gentext}</div>`;
        // $(html).appendTo('#model-output').hide().fadeIn("slow");
      };
      ws.onclose = () => {
        console.log("Closing websocket connection");
        $('#generate-text').removeClass("is-loading");
        $('#generate-text').prop("disabled", false);
      };
      ws.onerror = (jqXHR, textStatus, errorThrown) => {
        console.log(`jqXHR ${jqXHR}`);
        console.log(`textStatus: ${textStatus}`);
        console.log(`errorThrown: ${errorThrown}`);
        $('#generate-text').removeClass("is-loading");
        $('#generate-text').prop("disabled", false);
        // const html = '<div class="gen-box warning">There was an error generating the text! Please try again!</div><div class="gen-border"></div>';
        // $(html).appendTo('#model-output').hide().fadeIn("slow");
      };
    } else {
      alert("WebSockets not supported in your browser, please use the latest Firefox, Chrome, or similar!");
    }
  });

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
