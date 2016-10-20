var gulp = require('gulp');
var concat = require('gulp-concat');

var paths = {
  scripts: ['background/*.js']
};

gulp.task('scripts', function() {

  return gulp.src(paths.scripts)
      .pipe(concat('bg.js'))
    .pipe(gulp.dest(''));
});

gulp.task('default', ['scripts']);
