var _____WB$wombat$assign$function_____=function(name){return (self._wb_wombat && self._wb_wombat.local_init && self._wb_wombat.local_init(name))||self[name];};if(!self.__WB_pmw){self.__WB_pmw=function(obj){this.__WB_source=obj;return this;}}{
let window = _____WB$wombat$assign$function_____("window");
let self = _____WB$wombat$assign$function_____("self");
let document = _____WB$wombat$assign$function_____("document");
let location = _____WB$wombat$assign$function_____("location");
let top = _____WB$wombat$assign$function_____("top");
let parent = _____WB$wombat$assign$function_____("parent");
let frames = _____WB$wombat$assign$function_____("frames");
let opens = _____WB$wombat$assign$function_____("opens");
jQuery(document).ready(gformInitDatepicker);

function gformInitDatepicker(){
    jQuery('.datepicker').each(
        function (){
            var element = jQuery(this);
            var format = "mm/dd/yy";

            if(element.hasClass("mdy"))
                format = "mm/dd/yy";
            else if(element.hasClass("dmy"))
                format = "dd/mm/yy";
            else if(element.hasClass("dmy_dash"))
                format = "dd-mm-yy";
            else if(element.hasClass("dmy_dot"))
                format = "dd.mm.yy";
            else if(element.hasClass("ymd_slash"))
                format = "yy/mm/dd";
            else if(element.hasClass("ymd_dash"))
                format = "yy-mm-dd";
            else if(element.hasClass("ymd_dot"))
                format = "yy.mm.dd";

            var image = "";
            var showOn = "focus";
            if(element.hasClass("datepicker_with_icon")){
                showOn = "both";
                image = jQuery('#gforms_calendar_icon_' + this.id).val();
            }

            element.datepicker({ yearRange: '-100:+20', showOn: showOn, buttonImage: image, buttonImageOnly: true, dateFormat: format, changeMonth: true, changeYear: true });
        }
    );
}


}

/*
     FILE ARCHIVED ON 16:59:17 May 18, 2016 AND RETRIEVED FROM THE
     INTERNET ARCHIVE ON 01:10:50 May 27, 2026.
     JAVASCRIPT APPENDED BY WAYBACK MACHINE, COPYRIGHT INTERNET ARCHIVE.

     ALL OTHER CONTENT MAY ALSO BE PROTECTED BY COPYRIGHT (17 U.S.C.
     SECTION 108(a)(3)).
*/
/*
playback timings (ms):
  capture_cache.get: 0.381
  load_resource: 159.561
  PetaboxLoader3.resolve: 124.106
  PetaboxLoader3.datanode: 11.653
*/