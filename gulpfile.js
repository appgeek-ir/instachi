var gulp = require('gulp');
var concat = require('gulp-concat');
var minify = require('gulp-minify');
var uglify = require('gulp-uglify');
var stripLine  = require('gulp-strip-line');

var paths = {
  scripts: ['background/*.js']
};

gulp.task('scripts', function() {

  return gulp.src(paths.scripts)
            .pipe(concat('bg.js'))
            .pipe(gulp.dest(''));
});

gulp.task('minify',function(){
   gulp.src(['bg.js','main.js','inject.js','popup.js'])
       .pipe(stripLine(/^[\t ]*clog\(/))
       .pipe(uglify().on('error', function(e){
            console.log(e);
        }))
       .pipe(gulp.dest('dist'));
});

gulp.task('minify-debug',function(){
   gulp.src(['bg.js','main.js','inject.js','popup.js'])
       .pipe(uglify().on('error', function(e){
            console.log(e);
        }))
       .pipe(gulp.dest('dist-debug'));
});


gulp.task('default', ['scripts','minify','minify-debug']);
