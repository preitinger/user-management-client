# user-management-client

This repository contains the client part of a pair of repositories dealing with simple user management.
The related server part is in the project user-management-server.
This project was created mainly for learning. So, the features are very limited.
For example, there is no verification by sending emails with secrets to be entered in a web form during the registration process, or the like.
The repositories user-management-client and user-management-server are expected to be used as git submodules in a Next.JS project.
An example is in the repository user-management-test.

## Overall functionality of the pair of repositories

1. Register a new user just by sending a (new) user name and a password.
1. User name and hashed password is stored in a MongoDB collection.
1. Login by sending user name and password of a user that has been registered, before. The server returns a session token.

## Functionality of the client part in this repository

It provides a library function for fetching an api route for each of the following activities.
1. Registration
1. Login
1. Logout
