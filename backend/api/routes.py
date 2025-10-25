from flask import Flask, Blueprint, render_template

routes = Blueprint('routes', __name__)

# Route for your homepage, will serve your frontend HTML
@routes.route('/')
def home():
    print('hiiiiiii')
    return render_template('index.html')  # Serve the index.html file from the templates folder